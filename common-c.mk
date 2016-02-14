COMMON_C_DIR := moonlight-common-c/limelight-common
OPENAES_DIR := $(COMMON_C_DIR)/OpenAES

OPENAES_SOURCE := \
	$(OPENAES_DIR)/oaes_base64.c \
	$(OPENAES_DIR)/oaes_lib.c \
	
OPENAES_INCLUDE := $(OPENAES_DIR)

COMMON_C_SOURCE := \
	$(COMMON_C_DIR)/AudioStream.c         \
	$(COMMON_C_DIR)/ByteBuffer.c          \
	$(COMMON_C_DIR)/Connection.c          \
	$(COMMON_C_DIR)/ControlStream.c       \
	$(COMMON_C_DIR)/FakeCallbacks.c       \
	$(COMMON_C_DIR)/InputStream.c         \
	$(COMMON_C_DIR)/LinkedBlockingQueue.c \
	$(COMMON_C_DIR)/Misc.c                \
	$(COMMON_C_DIR)/Platform.c            \
	$(COMMON_C_DIR)/PlatformSockets.c     \
	$(COMMON_C_DIR)/RtpReorderQueue.c     \
	$(COMMON_C_DIR)/RtspConnection.c      \
	$(COMMON_C_DIR)/RtspParser.c          \
	$(COMMON_C_DIR)/SdpGenerator.c        \
	$(COMMON_C_DIR)/VideoDepacketizer.c   \
	$(COMMON_C_DIR)/VideoStream.c         \
	$(OPENAES_SOURCE)                     \

COMMON_C_INCLUDE := $(COMMON_C_DIR) $(OPENAES_INCLUDE)

COMMON_C_C_FLAGS := -Wno-missing-braces