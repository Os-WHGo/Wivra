// Wivra · tiny Emscripten binding over the official whisper.cpp C API (MIT).
// Built single-threaded (WebViews loaded from file:// have no SharedArrayBuffer),
// with WASM SIMD. Runs inside a Web Worker: one model, one job at a time.
// Output matches whisper.cpp's JSON shape ({ transcription:[{offsets:{from,to},text}],
// result:{language} }) so Wivra's existing adapter and transcript contract are reused.
// W86 (Claude). Wivra code under the repository license; whisper.cpp under MIT.
#include "whisper.h"

#include <emscripten/bind.h>
#include <emscripten/emscripten.h>

#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

namespace {
whisper_context * g_ctx = nullptr;
volatile int g_abort = 0;

std::string json_escape(const char * s) {
    std::string out;
    for (const unsigned char * p = (const unsigned char *) s; *p; ++p) {
        switch (*p) {
            case '"':  out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default:
                if (*p < 0x20) { char b[8]; snprintf(b, sizeof b, "\\u%04x", *p); out += b; }
                else out += (char) *p;
        }
    }
    return out;
}

bool abort_cb(void *) { return g_abort != 0; }

void progress_cb(whisper_context *, whisper_state *, int progress, void *) {
    EM_ASM({ if (Module.onWivraProgress) Module.onWivraProgress($0); }, progress);
}
}  // namespace

// Model bytes are copied into the WASM heap by JS (Module._malloc) and freed right after.
int wivra_load(uintptr_t ptr, size_t size) {
    if (g_ctx) { whisper_free(g_ctx); g_ctx = nullptr; }
    whisper_context_params cp = whisper_context_default_params();
    cp.use_gpu = false;
    g_ctx = whisper_init_from_buffer_with_params((void *) ptr, size, cp);
    return g_ctx ? 1 : 0;
}

void wivra_free() {
    if (g_ctx) { whisper_free(g_ctx); g_ctx = nullptr; }
}

void wivra_abort() { g_abort = 1; }

// samples: 16 kHz mono float32 already in the WASM heap. language: "auto" or ISO code.
// fallback: 1 = whisper's default temperature fallback (re-decodes doubtful pieces up to 5
// more times: better on hard audio, much slower); 0 = one greedy pass.
// audio_ctx: 0 = whisper's full 30 s window; N > 0 = encode only N frames (50 per second), much faster
// for short audio such as a dictated sentence (W89; measured in CI before use).
// Returns whisper.cpp-shaped JSON, or {"error":"..."}.
std::string wivra_transcribe(uintptr_t samples, int n_samples, std::string language, int fallback, int audio_ctx) {
    if (!g_ctx) return "{\"error\":\"MODEL_NOT_LOADED\"}";
    g_abort = 0;
    whisper_full_params p = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
    p.n_threads = 1;
    p.print_progress = false;
    p.print_realtime = false;
    p.print_special = false;
    p.print_timestamps = false;
    p.translate = false;
    p.no_context = true;
    p.single_segment = false;
    p.suppress_blank = true;
    p.language = language == "auto" ? "auto" : language.c_str();
    p.detect_language = false;
    if (!fallback) p.temperature_inc = 0.0f;
    if (audio_ctx > 0) p.audio_ctx = audio_ctx;
    p.abort_callback = abort_cb;
    p.abort_callback_user_data = nullptr;
    p.progress_callback = progress_cb;
    p.progress_callback_user_data = nullptr;
    const int rc = whisper_full(g_ctx, p, (const float *) samples, n_samples);
    if (g_abort) return "{\"error\":\"CANCELLED\"}";
    if (rc != 0) return "{\"error\":\"WHISPER_FAILED\"}";
    std::string out = "{\"result\":{\"language\":\"";
    out += whisper_lang_str(whisper_full_lang_id(g_ctx));
    out += "\"},\"transcription\":[";
    const int n = whisper_full_n_segments(g_ctx);
    for (int i = 0; i < n; ++i) {
        // whisper timestamps are in units of 10 ms
        const int64_t t0 = whisper_full_get_segment_t0(g_ctx, i) * 10;
        const int64_t t1 = whisper_full_get_segment_t1(g_ctx, i) * 10;
        if (i) out += ",";
        out += "{\"offsets\":{\"from\":" + std::to_string(t0) + ",\"to\":" + std::to_string(t1) + "},\"text\":\"";
        out += json_escape(whisper_full_get_segment_text(g_ctx, i));
        out += "\"}";
    }
    out += "]}";
    return out;
}

std::string wivra_system_info() { return whisper_print_system_info(); }

EMSCRIPTEN_BINDINGS(wivra_whisper) {
    emscripten::function("load", &wivra_load);
    emscripten::function("free", &wivra_free);
    emscripten::function("abort", &wivra_abort);
    emscripten::function("transcribe", &wivra_transcribe);
    emscripten::function("systemInfo", &wivra_system_info);
}
