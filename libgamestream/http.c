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
#include "errors.h"

#include <string.h>
#include <curl/curl.h>

#include <openssl/ssl.h>
#include <openssl/x509v3.h>
#include <openssl/pem.h>

extern X509 *g_Cert;
extern EVP_PKEY *g_PrivateKey;

static size_t _write_curl(void *contents, size_t size, size_t nmemb, void *userp)
{
  size_t realsize = size * nmemb;
  PHTTP_DATA mem = (PHTTP_DATA)userp;
 
  mem->memory = realloc(mem->memory, mem->size + realsize + 1);
  if(mem->memory == NULL)
    return 0;
 
  memcpy(&(mem->memory[mem->size]), contents, realsize);
  mem->size += realsize;
  mem->memory[mem->size] = 0;
 
  return realsize;
}

static CURLcode sslctx_function(CURL * curl, void * sslctx, void * parm)
{
    SSL_CTX* ctx = (SSL_CTX*)sslctx;
    
    if(!SSL_CTX_use_certificate(ctx, g_Cert))
        printf("SSL_CTX_use_certificate problem\n");
    
    if(!SSL_CTX_use_PrivateKey(ctx, g_PrivateKey))
        printf("Use Key failed\n");
    
    return CURLE_OK;
}

int http_request(const char* url, const char* ppkstr, PHTTP_DATA data) {
  int ret;
  CURL *curl;

  curl = curl_easy_init();
  if (!curl)
    return GS_FAILED;

  curl_easy_setopt(curl, CURLOPT_CAINFO, "/curl/ca-bundle.crt");
  curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, _write_curl);
  curl_easy_setopt(curl, CURLOPT_FAILONERROR, 1L);
  curl_easy_setopt(curl, CURLOPT_SSL_CTX_FUNCTION, *sslctx_function);
  curl_easy_setopt(curl, CURLOPT_SSL_SESSIONID_CACHE, 0L);
  curl_easy_setopt(curl, CURLOPT_MAXCONNECTS, 0L);
  curl_easy_setopt(curl, CURLOPT_FRESH_CONNECT, 1L);
  curl_easy_setopt(curl, CURLOPT_FORBID_REUSE, 1L);
  curl_easy_setopt(curl, CURLOPT_CONNECTTIMEOUT, 3L);
  curl_easy_setopt(curl, CURLOPT_NOSIGNAL, 1L);
  curl_easy_setopt(curl, CURLOPT_SSL_ENABLE_ALPN, 0L);
  curl_easy_setopt(curl, CURLOPT_WRITEDATA, data);
  curl_easy_setopt(curl, CURLOPT_URL, url);

  // Use the pinned certificate for HTTPS
  if (ppkstr != NULL) {
    curl_easy_setopt(curl, CURLOPT_SSL_VERIFYHOST, 0L);
    curl_easy_setopt(curl, CURLOPT_SSL_VERIFYPEER, 0L);
    curl_easy_setopt(curl, CURLOPT_PINNEDPUBLICKEY, ppkstr);
  }

  if (data->size > 0) {
    free(data->memory);
    data->memory = malloc(1);
    if(data->memory == NULL) {
      ret = GS_OUT_OF_MEMORY;
      goto cleanup;
    }

    data->size = 0;
  }

  CURLcode res = curl_easy_perform(curl);

  printf("CURL: %s (PPK: '%s') -> %s\n", url, ppkstr ? ppkstr : "<NULL>", curl_easy_strerror(res));
  
  if (res == CURLE_SSL_PINNEDPUBKEYNOTMATCH) {
    ret = GS_CERT_MISMATCH;
  } else if (res != CURLE_OK) {
    ret = GS_FAILED;
  } else if (data->memory == NULL) {
    ret = GS_OUT_OF_MEMORY;
  } else {
    ret = GS_OK;
  }
  
cleanup:
  curl_easy_cleanup(curl);
  return ret;
}

PHTTP_DATA http_create_data() {
  PHTTP_DATA data = malloc(sizeof(HTTP_DATA));
  if (data == NULL)
    return NULL;

  data->memory = malloc(1);
  if(data->memory == NULL) {
    free(data);
    return NULL;
  }
  data->size = 0;

  return data;
}

void http_free_data(PHTTP_DATA data) {
  if (data != NULL) {
    if (data->memory != NULL)
      free(data->memory);

    free(data);
  }
}
