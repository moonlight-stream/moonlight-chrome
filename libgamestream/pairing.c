/*
 * This file is part of Moonlight Embedded.
 *
 * Copyright (C) 2015 Iwan Timmer
 *
 * Moonlight is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 3 of the License, or
 * (at your option) any later version.
 *
 * Moonlight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Moonlight; if not, see <http://www.gnu.org/licenses/>.
 */

#include "http.h"
#include "mkcert.h"
#include "pairing.h"
#include "errors.h"

#include <sys/stat.h>
#include <stdbool.h>
#include <stdio.h>
#include <string.h>
#include <openssl/sha.h>
#include <openssl/aes.h>
#include <openssl/rand.h>
#include <openssl/evp.h>
#include <openssl/x509.h>
#include <openssl/pem.h>
#include <openssl/err.h>

const char* gs_error;

extern X509 *g_Cert;
extern EVP_PKEY *g_PrivateKey;
extern char* g_UniqueId;
extern char* g_CertHex;

static int xml_search(char* data, size_t len, char* node, char** result) {
    char startTag[256];
    char endTag[256];
    char* startOffset;
    char* endOffset;
    
    data = strdup(data);
    
    sprintf(startTag, "<%s>", node);
    sprintf(endTag, "</%s>", node);
    
    startOffset = strstr(data, startTag);
    if (startOffset == NULL) {
        free(data);
        return GS_FAILED;
    }
    
    endOffset = strstr(data, endTag);
    if (endOffset == NULL) {
        free(data);
        return GS_FAILED;
    }
    
    *endOffset = 0;
    
    *result = malloc(strlen(startOffset + strlen(startTag)) + 1);
    strcpy(*result, startOffset + strlen(startTag));
    
    free(data);
    return GS_OK;
}

static void bytes_to_hex(unsigned char *in, char *out, size_t len) {
    for (int i = 0; i < len; i++) {
        sprintf(out + i * 2, "%02x", in[i]);
    }
    out[len * 2] = 0;
}

static int sign_it(const unsigned char *msg, size_t mlen, unsigned char **sig, size_t *slen, EVP_PKEY *pkey) {
    int result = GS_FAILED;
    
    *sig = NULL;
    *slen = 0;
    
    EVP_MD_CTX *ctx = EVP_MD_CTX_create();
    if (ctx == NULL)
        return GS_FAILED;
    
    const EVP_MD *md = EVP_get_digestbyname("SHA256");
    if (md == NULL)
        goto cleanup;
    
    int rc = EVP_DigestInit_ex(ctx, md, NULL);
    if (rc != 1)
        goto cleanup;
    
    rc = EVP_DigestSignInit(ctx, NULL, md, NULL, pkey);
    if (rc != 1)
        goto cleanup;
    
    rc = EVP_DigestSignUpdate(ctx, msg, mlen);
    if (rc != 1)
        goto cleanup;
    
    size_t req = 0;
    rc = EVP_DigestSignFinal(ctx, NULL, &req);
    if (rc != 1 || !(req > 0))
        goto cleanup;
    
    *sig = OPENSSL_malloc(req);
    if (*sig == NULL)
        goto cleanup;
    
    *slen = req;
    rc = EVP_DigestSignFinal(ctx, *sig, slen);
    if (rc != 1 || req != *slen)
        goto cleanup;
    
    result = GS_OK;
    
cleanup:
    EVP_MD_CTX_destroy(ctx);
    ctx = NULL;
    
    return result;
}

static bool verifySignature(const unsigned char *data, int dataLength, unsigned char *signature, int signatureLength, X509 *cert) {
    EVP_PKEY* pubKey = X509_get_pubkey(cert);
    EVP_MD_CTX *mdctx = NULL;
    mdctx = EVP_MD_CTX_create();
    EVP_DigestVerifyInit(mdctx, NULL, EVP_sha256(), NULL, pubKey);
    EVP_DigestVerifyUpdate(mdctx, data, dataLength);
    int result = EVP_DigestVerifyFinal(mdctx, signature, signatureLength);

    EVP_PKEY_free(pubKey);
    EVP_MD_CTX_destroy(mdctx);
    
    return result > 0;
}

X509* get_cert(PHTTP_DATA data) {
    char *pemcerthex;

    if (xml_search(data->memory, data->size, "plaincert", &pemcerthex) != GS_OK)
        return NULL;

    // Convert cert from hex string to the PEM string and null terminate
    int hexstrlen = strlen(pemcerthex);
    char *pemcert = malloc(hexstrlen / 2 + 1);
    for (int count = 0; count < hexstrlen; count += 2) {
        sscanf(&pemcerthex[count], "%2hhx", &pemcert[count / 2]);
    }
    pemcert[hexstrlen / 2] = 0;
    free(pemcerthex);

    // pemcert is referenced, but NOT copied!
    BIO* bio = BIO_new_mem_buf(pemcert, -1);

    if (bio) {
        X509* cert = PEM_read_bio_X509(bio, NULL, NULL, NULL);
        BIO_free_all(bio);
        free(pemcert);
        return cert;
    }
    else {
        free(pemcert);
        return NULL;
    }
}

static char* x509_to_curl_ppk_string(X509* x509) {
    BIO* bio = BIO_new(BIO_s_mem());

    // Get x509 public key alone in DER format
    EVP_PKEY* pubkey = X509_get_pubkey(x509);
    i2d_PUBKEY_bio(bio, pubkey);
    EVP_PKEY_free(pubkey);

    BUF_MEM* mem;
    BIO_get_mem_ptr(bio, &mem);

    // SHA256 hash the resulting DER string
    unsigned char pubkeyhash[32];
    SHA256((unsigned char*)mem->data, mem->length, pubkeyhash);
    BIO_free(bio);

    // Base64-encode the resulting SHA256 hash
    bio = BIO_new(BIO_s_mem());
    BIO* b64 = BIO_new(BIO_f_base64());
    bio = BIO_push(b64, bio);
    BIO_set_flags(bio, BIO_FLAGS_BASE64_NO_NL);
    BIO_write(bio, pubkeyhash, sizeof(pubkeyhash));
    BIO_flush(bio);

    BIO_get_mem_ptr(bio, &mem);

    // Assemble the final curl PPK string
    const char* prefix = "sha256//";
    char* ret = malloc(strlen(prefix) + mem->length + 1);
    memcpy(ret, prefix, strlen(prefix));
    memcpy(&ret[strlen(prefix)], mem->data, mem->length);
    ret[strlen(prefix) + mem->length] = 0;

    BIO_free_all(bio);

    return ret;
}

int gs_unpair(const char* address) {
  int ret = GS_OK;
  char url[4096];
  PHTTP_DATA data = http_create_data();
  if (data == NULL)
    return GS_OUT_OF_MEMORY;

  snprintf(url, sizeof(url), "http://%s:47989/unpair?uniqueid=%s", address, g_UniqueId);
  ret = http_request(url, NULL, data);

  http_free_data(data);
  return ret;
}

int gs_pair(int serverMajorVersion, const char* address, const char* pin, char** curl_ppk_string) {
  int ret = GS_OK;
  char* result = NULL;
  X509* server_cert = NULL;
  char url[4096];
  
  unsigned char salt_data[16];
  char salt_hex[33];
  RAND_bytes(salt_data, 16);
  bytes_to_hex(salt_data, salt_hex, 16);

  snprintf(url, sizeof(url), "http://%s:47989/pair?uniqueid=%s&devicename=roth&updateState=1&phrase=getservercert&salt=%s&clientcert=%s", address, g_UniqueId, salt_hex, g_CertHex);
  PHTTP_DATA data = http_create_data();
  if (data == NULL)
    return GS_OUT_OF_MEMORY;
  else if ((ret = http_request(url, NULL, data)) != GS_OK)
    goto cleanup;

  if ((ret = xml_search(data->memory, data->size, "paired", &result)) != GS_OK)
    goto cleanup;

  if (strcmp(result, "1") != 0) {
    ret = GS_FAILED;
    goto cleanup;
  }

  free(result);
  result = NULL;
  server_cert = get_cert(data);
  if (server_cert == NULL) {
    ret = GS_FAILED;
    goto cleanup;
  }

  unsigned char salt_pin[20];
  unsigned char aes_key_hash[32];
  AES_KEY enc_key, dec_key;
  memcpy(salt_pin, salt_data, 16);
  memcpy(salt_pin+16, pin, 4);

  int hash_length = serverMajorVersion >= 7 ? 32 : 20;
  if (serverMajorVersion >= 7)
    SHA256(salt_pin, 20, aes_key_hash);
  else
    SHA1(salt_pin, 20, aes_key_hash);

  AES_set_encrypt_key((unsigned char *)aes_key_hash, 128, &enc_key);
  AES_set_decrypt_key((unsigned char *)aes_key_hash, 128, &dec_key);

  unsigned char challenge_data[16];
  unsigned char challenge_enc[16];
  char challenge_hex[33];
  RAND_bytes(challenge_data, 16);
  AES_encrypt(challenge_data, challenge_enc, &enc_key);
  bytes_to_hex(challenge_enc, challenge_hex, 16);

  snprintf(url, sizeof(url), "http://%s:47989/pair?uniqueid=%s&devicename=roth&updateState=1&clientchallenge=%s", address, g_UniqueId, challenge_hex);
  if ((ret = http_request(url, NULL, data)) != GS_OK)
    goto cleanup;

  free(result);
  result = NULL;
  if ((ret = xml_search(data->memory, data->size, "paired", &result)) != GS_OK)
    goto cleanup;

  if (strcmp(result, "1") != 0) {
    ret = GS_FAILED;
    goto cleanup;
  }

  free(result);
  result = NULL;
  if (xml_search(data->memory, data->size, "challengeresponse", &result) != GS_OK) {
    ret = GS_INVALID;
    goto cleanup;
  }

  unsigned char challenge_response_data_enc[48];
  unsigned char challenge_response_data[48];
  for (int count = 0; count < strlen(result); count += 2) {
    sscanf(&result[count], "%2hhx", &challenge_response_data_enc[count / 2]);
  }

  for (int i = 0; i < 48; i += 16) {
    AES_decrypt(&challenge_response_data_enc[i], &challenge_response_data[i], &dec_key);
  }

  unsigned char client_secret_data[16];
  RAND_bytes(client_secret_data, 16);

  ASN1_BIT_STRING *asnSignature;
  X509_get0_signature(&asnSignature, NULL, g_Cert);

  unsigned char challenge_response[16 + 256 + 16];
  unsigned char challenge_response_hash[32];
  unsigned char challenge_response_hash_enc[32];
  char challenge_response_hex[65];
  memcpy(challenge_response, challenge_response_data + hash_length, 16);
  memcpy(challenge_response + 16, asnSignature->data, 256);
  memcpy(challenge_response + 16 + 256, client_secret_data, 16);
  if (serverMajorVersion >= 7)
    SHA256(challenge_response, 16 + 256 + 16, challenge_response_hash);
  else
    SHA1(challenge_response, 16 + 256 + 16, challenge_response_hash);

  for (int i = 0; i < 32; i += 16) {
    AES_encrypt(&challenge_response_hash[i], &challenge_response_hash_enc[i], &enc_key);
  }
  bytes_to_hex(challenge_response_hash_enc, challenge_response_hex, 32);

  snprintf(url, sizeof(url), "http://%s:47989/pair?uniqueid=%s&devicename=roth&updateState=1&serverchallengeresp=%s", address, g_UniqueId, challenge_response_hex);
  if ((ret = http_request(url, NULL, data)) != GS_OK)
    goto cleanup;

  free(result);
  result = NULL;
  if ((ret = xml_search(data->memory, data->size, "paired", &result)) != GS_OK)
    goto cleanup;

  if (strcmp(result, "1") != 0) {
    ret = GS_FAILED;
    goto cleanup;
  }

  free(result);
  result = NULL;
  if (xml_search(data->memory, data->size, "pairingsecret", &result) != GS_OK) {
    ret = GS_INVALID;
    goto cleanup;
  }

  unsigned char pairing_secret[16 + 256];
  for (int count = 0; count < strlen(result); count += 2) {
    sscanf(&result[count], "%2hhx", &pairing_secret[count / 2]);
  }

  if (!verifySignature(pairing_secret, 16, pairing_secret+16, 256, server_cert)) {
    ret = GS_FAILED;
    goto cleanup;
  }

  unsigned char *signature = NULL;
  size_t s_len;
  if (sign_it(client_secret_data, 16, &signature, &s_len, g_PrivateKey) != GS_OK) {
    ret = GS_FAILED;
    goto cleanup;
  }

  unsigned char client_pairing_secret[16 + 256];
  char client_pairing_secret_hex[(16 + 256) * 2 + 1];
  memcpy(client_pairing_secret, client_secret_data, 16);
  memcpy(client_pairing_secret + 16, signature, 256);
  bytes_to_hex(client_pairing_secret, client_pairing_secret_hex, 16 + 256);

  snprintf(url, sizeof(url), "http://%s:47989/pair?uniqueid=%s&devicename=roth&updateState=1&clientpairingsecret=%s", address, g_UniqueId, client_pairing_secret_hex);
  if ((ret = http_request(url, NULL, data)) != GS_OK)
    goto cleanup;

  free(result);
  result = NULL;
  if ((ret = xml_search(data->memory, data->size, "paired", &result)) != GS_OK)
    goto cleanup;

  if (strcmp(result, "1") != 0) {
    ret = GS_FAILED;
    goto cleanup;
  }

  *curl_ppk_string = x509_to_curl_ppk_string(server_cert);

  cleanup:
  if (ret != GS_OK)
    gs_unpair(address);
  
  if (result != NULL)
    free(result);

  if (server_cert != NULL)
    X509_free(server_cert);

  http_free_data(data);

  return ret;
}