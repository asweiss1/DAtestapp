// Later, a Supabase Edge Function named ask-variety can answer a question
// about one variety. This file only builds that request. It does not call it.

export const ASK_VARIETY_FUNCTION = "ask-variety";

export function askVarietyRequest(variety, question) {
  return {
    function: ASK_VARIETY_FUNCTION,
    body: {
      variety: String(variety || "").trim(),
      question: String(question || "").trim(),
    },
  };
}
