#include "moonlight.hpp"

#include "ppapi/cpp/var_array_buffer.h"

#include <http.h>
#include <errors.h>
#include <string.h>
#include <sys/mount.h>

#include <mkcert.h>
#include <openssl/bio.h>
#include <openssl/pem.h>

#include <curl/curl.h>

X509 *g_Cert;
EVP_PKEY *g_PrivateKey;
char *g_UniqueId;
char *g_CertHex;
pthread_mutex_t *g_OSSLMutexes;

void MoonlightInstance::MakeCert(int32_t callbackId, pp::VarArray args)
{
    pp::VarDictionary ret;
    ret.Set("callbackId", pp::Var(callbackId));
    ret.Set("type", pp::Var("resolve"));
    
    pp::VarDictionary retData;
    
    CERT_KEY_PAIR certKeyPair = mkcert_generate();
    
    BIO* bio = BIO_new(BIO_s_mem());
    
    PEM_write_bio_X509(bio, certKeyPair.x509);
    BUF_MEM *mem = NULL;
    BIO_get_mem_ptr(bio, &mem);
    
    std::string cert(mem->data, mem->length);
    
    BIO_free(bio);
    
    BIO* biokey = BIO_new(BIO_s_mem());
    PEM_write_bio_PrivateKey(biokey, certKeyPair.pkey, NULL, NULL, 0, NULL, NULL);
    BIO_get_mem_ptr(biokey, &mem);
    
    std::string pkey(mem->data, mem->length);
    
    BIO_free(biokey);
    
    retData.Set("privateKey", pkey.c_str());
    retData.Set("cert", cert.c_str());
    
    ret.Set("ret", retData);
    PostMessage(ret);
}

void MoonlightInstance::LoadCert(const char* certStr, const char* keyStr)
{
    char* _certStr = strdup(certStr);
    char* _keyStr = strdup(keyStr);
    
    BIO *bio = BIO_new_mem_buf(_certStr, -1);
    if(!(g_Cert = PEM_read_bio_X509(bio, NULL, NULL, NULL))) {
        PostMessage(pp::Var("Error loading cert into memory"));
    }
    BIO_free_all(bio);
    
    bio = BIO_new_mem_buf(_keyStr, -1);
    if (!(g_PrivateKey = PEM_read_bio_PrivateKey(bio, NULL, NULL, NULL))) {
        PostMessage(pp::Var("Error loading private key into memory"));
    }
    BIO_free_all(bio);
    
    // Convert the PEM cert to hex
    g_CertHex = (char*)malloc((strlen(certStr) * 2) + 1);
    for (int i = 0; i < strlen(certStr); i++) {
        sprintf(&g_CertHex[i * 2], "%02x", certStr[i]);
    }
    
    free(_certStr);
    free(_keyStr);
}

void MoonlightInstance::OSSLThreadLock(int mode, int n, const char *, int)
{
    if (mode & CRYPTO_LOCK) {
        pthread_mutex_lock(&g_OSSLMutexes[n]);
    }
    else {
        pthread_mutex_unlock(&g_OSSLMutexes[n]);
    }
}

unsigned long MoonlightInstance::OSSLThreadId(void)
{
    return (unsigned long)pthread_self();
}

void MoonlightInstance::NvHTTPInit(int32_t callbackId, pp::VarArray args)
{
    std::string _cert = args.Get(0).AsString();
    std::string _key = args.Get(1).AsString();
    std::string _uniqueId = args.Get(2).AsString();

    // Mount resource directory where CA bundle resides
    mount("static/curl", "/curl", "httpfs", 0, "");

    // This will initialize OpenSSL
    curl_global_init(CURL_GLOBAL_DEFAULT);

    LoadCert(_cert.c_str(), _key.c_str());
    g_UniqueId = strdup(_uniqueId.c_str());

    g_OSSLMutexes = new pthread_mutex_t[CRYPTO_num_locks()];
    for (int i = 0; i < CRYPTO_num_locks(); i++) {
        pthread_mutex_init(&g_OSSLMutexes[i], NULL);
    }

    CRYPTO_set_id_callback(OSSLThreadId);
    CRYPTO_set_locking_callback(OSSLThreadLock);
    
    pp::VarDictionary ret;
    ret.Set("callbackId", pp::Var(callbackId));
    ret.Set("type", pp::Var("resolve"));
    ret.Set("ret", pp::Var());
    PostMessage(ret);
}

void MoonlightInstance::NvHTTPRequest(int32_t /*result*/, int32_t callbackId, pp::VarArray args)
{
    std::string url = args.Get(0).AsString();
    std::string ppkstr = args.Get(1).AsString();
    bool binaryResponse = args.Get(2).AsBool();

    PostMessage(pp::Var(url.c_str()));

    PHTTP_DATA data = http_create_data();
    int err;

    if (data == NULL) {
        pp::VarDictionary ret;
        ret.Set("callbackId", pp::Var(callbackId));
        ret.Set("type", pp::Var("reject"));
        ret.Set("ret", pp::Var("Error when creating data buffer."));
        PostMessage(ret);
        goto clean_data;
    }
    
    err = http_request(url.c_str(), ppkstr.empty() ? NULL : ppkstr.c_str(), data);
    if (err) {
        pp::VarDictionary ret;
        ret.Set("callbackId", pp::Var(callbackId));
        ret.Set("type", pp::Var("reject"));
        ret.Set("ret", pp::Var(err));
        PostMessage(ret);
        goto clean_data;
    }
    
    if (binaryResponse) {
        // Response data will be returned to JS as an ArrayBuffer
        
        pp::VarDictionary ret;
        ret.Set("callbackId", pp::Var(callbackId));
        ret.Set("type", pp::Var("resolve"));
        
        // Construct an array buffer and copy the response data into it
        pp::VarArrayBuffer arrBuf = pp::VarArrayBuffer(data->size);
        memcpy(arrBuf.Map(), data->memory, data->size);
        arrBuf.Unmap();
        
        ret.Set("ret", arrBuf);
        PostMessage(ret);
    } else {
        // Response data will be returned to JS as a UTF-8 string
        
        pp::VarDictionary ret;
        ret.Set("callbackId", pp::Var(callbackId));
        ret.Set("type", pp::Var("resolve"));
        ret.Set("ret", pp::Var(data->memory));
        PostMessage(ret);
    }
    
clean_data:
    http_free_data(data);
}
