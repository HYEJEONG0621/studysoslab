exports.handler = async function(event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "POST 요청만 사용할 수 있습니다." })
    };
  }

  try {
    const { type, payload } = JSON.parse(event.body || "{}");

    if (!process.env.OPENAI_API_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "OPENAI_API_KEY 환경변수가 설정되지 않았습니다."
        })
      };
    }

    const prompt = makePrompt(type, payload);

    let messages;

    if (type === "mindmapImageCompare" && payload?.imageDataUrl) {
      messages = [
        {
          role: "system",
          content:
            "너는 중학생의 자기조절학습을 돕는 친절한 학습 코치다. 학생이 직접 그린 마인드맵을 보고, AI 추천 마인드맵과 비교하여 복습에 도움이 되는 피드백을 준다. 평가보다는 개선 방향을 구체적으로 제안한다."
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: prompt
            },
            {
              type: "image_url",
              image_url: {
                url: payload.imageDataUrl
              }
            }
          ]
        }
      ];
    } else {
      messages = [
        {
          role: "system",
          content:
            "너는 중학생의 자기조절학습을 돕는 친절한 AI 학습 코치다. 답변은 한국어로, 학생이 바로 실천할 수 있게 짧고 구체적으로 작성한다."
        },
        {
          role: "user",
          content: prompt
        }
      ];
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages,
        temperature: 0.4
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({
          error: data.error?.message || "OpenAI API 오류가 발생했습니다."
        })
      };
    }

    const text = data.choices?.[0]?.message?.content || "";

    return {
      statusCode: 200,
      body: JSON.stringify({ text })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message || "Netlify Function 오류가 발생했습니다."
      })
    };
  }
};

function makePrompt(type, payload = {}) {
  if (type === "homeFeedback") {
    return `
학생의 학습 현황을 보고 짧은 격려와 오늘의 실천 조언을 해줘.

전체 과제 수: ${payload.total}
완료 과제 수: ${payload.done}
총 실제 학습 시간: ${payload.totalActual}분
과제 목록:
${JSON.stringify(payload.tasks || [], null, 2)}
`;
  }

  if (type === "smartOne") {
    return `
SMART 목표 설정 중 "${payload.aspect}" 항목을 점검해줘.

질문: ${payload.question}
학생 답변: ${payload.value}

학생이 바로 고칠 수 있도록 2~3문장으로 제안해줘.
`;
  }

  if (type === "smartFull") {
    return `
학생의 SMART 목표를 종합해 더 명확한 학습 목표 문장으로 바꿔줘.

Specific: ${payload.specific}
Measurable: ${payload.measurable}
Achievable: ${payload.achievable}
Relevant: ${payload.relevant}
Time-bound: ${payload.timebound}

출력 형식:
1. 다듬은 목표
2. 오늘 바로 할 일
3. 주의할 점
`;
  }

  if (type === "priorityCompare") {
    return `
학생의 주간 과제 우선순위를 분석해줘.

과제 목록:
${JSON.stringify(payload.tasks || [], null, 2)}

중요도와 긴급도 기준으로 잘 배치된 점과 조정하면 좋은 점을 짧게 알려줘.
`;
  }

  if (type === "analysis") {
    return `
학생의 학습 기록을 분석해줘.

과제 기록:
${JSON.stringify(payload.tasks || [], null, 2)}

출력은 짧은 문장 3개로 작성해줘.
1. 잘하고 있는 점
2. 개선할 점
3. 다음 계획 제안
`;
  }

  if (type === "wrapup") {
    if (payload.mode === "mindmap") {
      return `
다음 학습 내용을 마인드맵으로 정리할 수 있도록 핵심 키워드 9개 이내로 뽑아줘.

학습 내용:
${payload.content}

조건:
- 짧은 키워드 중심
- 쉼표나 번호 없이 한 줄에 하나씩
- 중학생이 이해할 수 있는 쉬운 표현
`;
    }

    if (payload.mode === "summary") {
      return `
다음 학습 내용을 3줄로 요약해줘.

학습 내용:
${payload.content}
`;
    }

    if (payload.mode === "quiz") {
      return `
다음 학습 내용을 바탕으로 복습 퀴즈 3문항을 만들어줘.

학습 내용:
${payload.content}

형식:
1. 문제
- 정답
- 해설
`;
    }
  }

  if (type === "mindmapImageCompare") {
    return `
학생이 직접 그린 마인드맵 사진을 보고, 아래 AI 추천 마인드맵 구조와 비교해줘.

학생이 입력한 학습 내용:
${payload.content}

AI 추천 마인드맵 구조:
${JSON.stringify(payload.aiMindmap || {}, null, 2)}

반드시 아래 JSON 형식만 출력해줘. 설명 문장은 JSON 밖에 쓰지 마.

{
  "score": "상/중/하 중 하나와 짧은 이유",
  "good": ["학생 마인드맵에서 잘한 점 1", "잘한 점 2"],
  "missing": ["보완하면 좋은 점 1", "보완하면 좋은 점 2"],
  "advice": ["최종 복습을 위해 학생이 바로 할 일 1", "바로 할 일 2"],
  "keywords": ["추가하면 좋은 핵심어1", "핵심어2", "핵심어3"]
}

판단 기준:
- 중심 주제가 분명한가
- 큰 가지가 적절한가
- 하위 개념이 충분한가
- 개념 간 연결이 드러나는가
- 예시나 주의점이 포함되어 있는가
`;
  }

  return `
다음 내용을 보고 학생에게 도움이 되는 학습 피드백을 해줘.

${JSON.stringify(payload, null, 2)}
`;
}
