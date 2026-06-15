import { useMutation } from "@tanstack/react-query"

interface LLMMessage {
  role: "system" | "user" | "assistant"
  content: string
}

export function useLLM() {
  return useMutation({
    mutationFn: async (messages: LLMMessage[]) => {
      console.log("[llm] requesting, messages:", messages.length)
      const res = await myFetch<{ content: string }>("/llm", {
        method: "POST",
        body: { messages },
      })
      console.log("[llm] response received:", res.content.length, "chars")
      return res.content
    },
    onError: (err) => {
      console.error("[llm] mutation error:", err)
    },
  })
}
