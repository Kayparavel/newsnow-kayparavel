import { useMutation } from "@tanstack/react-query"

export function useTTS() {
  return useMutation({
    mutationFn: async (text: string) => {
      console.log("[tts] requesting, text length:", text.length)
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      })
      if (!res.ok) {
        const err = await res.text()
        console.error("[tts] server error:", res.status, err)
        throw new Error(`TTS failed: ${res.status}`)
      }
      const blob = await res.blob()
      console.log("[tts] received blob:", blob.size, "bytes")
      return blob
    },
    onError: (err) => {
      console.error("[tts] mutation error:", err)
    },
  })
}
