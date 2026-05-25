export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST 요청만 허용됩니다." }), {
      status: 405,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const { type, payload } = await req.json();

    const systemPrompt = makeSystemPrompt(type);
    const userPrompt = makeUserPrompt(type, payload);

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return new Response(JSON.stringify({
        error: data.error?.message || "OpenAI API 오류"
      }), {
        status: response.status,
        headers: { "Content-Type": "application/json" }
      });
    }

    const text =
      data.output_text ||
      data.output?.[0]?.content?.[0]?.text ||
      "AI 응답을 가져오지 못했습니다.";

    return new Response(JSON.stringify({ text }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

function makeSystemPrompt(type) {
  return "당신은 초·중·고 학생을 돕는 친절한 자기조절학습 코치입니다. 학생에게 쉬운 말로, 구체적이고 따뜻하게 피드백하세요.";
}

function makeUserPrompt(type, payload) {
  if (type === "homeFeedback") {
    return `학생의 학습 현황입니다.
전체 과제 ${payload.total}개, 완료 ${payload.done}개, 실제 공부 시간 ${payload.totalActual}분입니다.
짧은 격려와 구체적인 조언 1가지를 2~3문장으로 작성해 주세요.`;
  }

  if (type === "smartOne") {
    return `학생 입력: ${payload.value}
SMART 목표의 ${payload.aspect} 관점에서 피드백해 주세요.
질문은 "${payload.question}"입니다.`;
  }

  if (type === "smartFull") {
    return `학생의 SMART 목표 입력입니다.
Specific: ${payload.specific}
Measurable: ${payload.measurable}
Achievable: ${payload.achievable}
Relevant: ${payload.relevant}
Time-bound: ${payload.timebound}

완성된 목표 문장과 짧은 응원 문장을 작성해 주세요.`;
  }

  if (type === "priorityCompare") {
    return `학생의 과제 목록입니다.
${JSON.stringify(payload.tasks, null, 2)}

중요도와 긴급도 관점에서 우선순위 조언을 150자 이내로 해 주세요.`;
  }

  if (type === "analysis") {
    return `학생의 학습 기록입니다.
${JSON.stringify(payload.tasks, null, 2)}

3가지 핵심 인사이트를 번호로 정리해 주세요.`;
  }

  if (type === "wrapup") {
    return `정리 방식: ${payload.mode}
학습 내용: ${payload.content}

정리 방식에 맞게 학생용으로 정리해 주세요.`;
  }

  return JSON.stringify(payload);
}
