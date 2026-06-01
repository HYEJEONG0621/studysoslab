exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json; charset=utf-8"
  };

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true })
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method Not Allowed" })
    };
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: "OPENAI_API_KEY 환경변수가 설정되지 않았습니다."
        })
      };
    }

    let body = {};
    try {
      body = JSON.parse(event.body || "{}");
    } catch (e) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "잘못된 JSON 형식입니다." })
      };
    }

    const type = body.type || "general";
    const payload = body.payload || {};
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    const promptPack = buildPrompt(type, payload);
    const userContent = buildUserContent(promptPack);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: promptPack.temperature ?? 0.7,
        messages: [
          {
            role: "system",
            content: promptPack.system
          },
          {
            role: "user",
            content: userContent
          }
        ]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({
          error:
            data?.error?.message ||
            "OpenAI API 호출 중 오류가 발생했습니다."
        })
      };
    }

    const text =
      data?.choices?.[0]?.message?.content?.trim() ||
      "AI 응답이 비어 있습니다.";

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ text })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: error.message || "서버 오류가 발생했습니다."
      })
    };
  }
};

function buildUserContent(promptPack) {
  const images = Array.isArray(promptPack.images) ? promptPack.images : [];

  if (!images.length) {
    return promptPack.prompt;
  }

  const content = [{ type: "text", text: promptPack.prompt }];

  images.forEach((img) => {
    if (typeof img === "string" && img.trim()) {
      content.push({
        type: "image_url",
        image_url: {
          url: img.trim()
        }
      });
    }
  });

  return content;
}

function buildPrompt(type, payload) {
  const baseSystem = `
당신은 한국의 초·중·고 학생을 돕는 친절한 학습 코치입니다.
답변은 반드시 한국어로 작성하세요.
학생이 이해하기 쉬운 표현을 사용하세요.
불필요하게 길지 않게, 그러나 실제로 도움이 되게 작성하세요.
줄바꿈을 적절히 사용하고, 구조적으로 정리하세요.
`.trim();

  if (type === "homeFeedback") {
    return {
      system: baseSystem,
      temperature: 0.7,
      prompt: `
다음 학습 데이터를 보고 학생에게 짧고 따뜻한 피드백을 작성하세요.

[조건]
- 4~6문장 정도
- 칭찬 1개 + 개선점 1개 + 오늘 바로 할 행동 1개 포함
- 부담스럽지 않게 말할 것

[학습 데이터]
총 과제 수: ${safe(payload.total)}
완료 과제 수: ${safe(payload.done)}
총 실제 학습 시간(분): ${safe(payload.totalActual)}

과제 목록:
${formatTaskList(payload.tasks)}
`.trim()
    };
  }

  if (type === "smartOne") {
    return {
      system: baseSystem,
      temperature: 0.6,
      prompt: `
학생의 SMART 목표 설정을 도와주세요.

영역: ${safe(payload.aspect)}
질문: ${safe(payload.question)}
학생 입력: ${safe(payload.value)}

[조건]
- 3~5문장
- 더 구체적으로 바꿀 수 있게 도와줄 것
- 학생이 바로 수정할 수 있는 예시 1개 포함
`.trim()
    };
  }

  if (type === "smartFull") {
    return {
      system: baseSystem,
      temperature: 0.7,
      prompt: `
학생의 SMART 목표를 종합해서 정리해주세요.

Specific: ${safe(payload.specific)}
Measurable: ${safe(payload.measurable)}
Achievable: ${safe(payload.achievable)}
Relevant: ${safe(payload.relevant)}
Time-bound: ${safe(payload.timebound)}

[출력 형식]
1. 목표 한 줄 정리
2. SMART 점검
- S:
- M:
- A:
- R:
- T:
3. 최종 추천 목표 문장

학생이 그대로 읽고 수정할 수 있게 간단명료하게 작성하세요.
`.trim()
    };
  }

  if (type === "priorityCompare") {
    return {
      system: baseSystem,
      temperature: 0.7,
      prompt: `
학생의 과제 우선순위를 분석해주세요.

과제 목록:
${formatTaskList(payload.tasks)}

[조건]
- 먼저 해야 할 일, 미리 준비할 일, 짧게 끝낼 일, 나중에 해도 될 일을 간단히 판단
- 학생의 현재 배치를 존중하되, AI 관점에서 조정할 만한 점을 알려줄 것
- 5~8문장 정도
`.trim()
    };
  }

  if (type === "analysis") {
    return {
      system: baseSystem,
      temperature: 0.7,
      prompt: `
학생의 학습 패턴을 간단히 분석해주세요.

과제 목록:
${formatTaskList(payload.tasks)}

[조건]
- 줄바꿈으로 4~6줄
- 각 줄은 한 가지 핵심 피드백
- 계획 대비 실제 시간, 완료율, 과목 편중 여부 등을 참고
- 학생에게 다음 주 실천 팁 포함
`.trim()
    };
  }

  if (type === "wrapup") {
    return buildWrapupPrompt(baseSystem, payload);
  }

  return {
    system: baseSystem,
    temperature: 0.7,
    prompt: `
학생의 학습을 도와주는 짧은 조언을 작성하세요.
입력 데이터:
${safe(JSON.stringify(payload, null, 2))}
`.trim()
  };
}

function buildWrapupPrompt(baseSystem, payload) {
  const mode = safe(payload.mode || "summary").toLowerCase();
  const content = safe(payload.content || "");
  const image = pickImage(payload);

  if (mode === "mindmap") {
    if (image) {
      return {
        system: `${baseSystem}

추가 역할:
당신은 학생이 직접 만든 마인드맵 사진을 보고,
1) 중심 주제 파악
2) 핵심 가지 정리
3) 보완점 제안
4) AI 추천 마인드맵 구조 제안
을 해주는 학습 코치입니다.

아래 형식을 정확히 지켜서 답변하세요.
`,
        temperature: 0.6,
        images: [image],
        prompt: `
학생이 공부한 내용:
${content || "학생이 공부한 내용 설명 없음"}

학생이 직접 만든 마인드맵 이미지가 함께 제공됩니다.
이미지를 보고 학생 마인드맵의 중심 주제, 큰 가지, 하위 가지를 파악해 주세요.

반드시 아래 형식을 정확히 지켜 답변하세요.

[TOPIC]
중심 주제를 한 줄로 작성

[AI_MINDMAP]
중심주제: ...
큰가지1: ...
- 하위1: ...
- 하위2: ...
큰가지2: ...
- 하위1: ...
- 하위2: ...
큰가지3: ...
- 하위1: ...
- 하위2: ...
큰가지4: ...
- 하위1: ...
- 하위2: ...

[COMPARE]
비교 결과: 한 줄 요약

[GOOD]
- 잘한 점 1
- 잘한 점 2

[IMPROVE]
- 보완점 1
- 보완점 2

[REVIEW]
- 최종 복습 제안 1
- 최종 복습 제안 2

[TAGS]
태그1, 태그2, 태그3
`.trim()
      };
    }

    return {
      system: `${baseSystem}

추가 역할:
당신은 학습 내용을 마인드맵 형태로 정리해 주는 학습 코치입니다.
아래 형식을 정확히 지켜 답변하세요.
`,
      temperature: 0.6,
      prompt: `
다음 학습 내용을 바탕으로 마인드맵용 구조를 만들어 주세요.

학습 내용:
${content}

반드시 아래 형식을 정확히 지켜 답변하세요.

[TOPIC]
중심 주제를 한 줄로 작성

[AI_MINDMAP]
중심주제: ...
큰가지1: ...
- 하위1: ...
- 하위2: ...
큰가지2: ...
- 하위1: ...
- 하위2: ...
큰가지3: ...
- 하위1: ...
- 하위2: ...
큰가지4: ...
- 하위1: ...
- 하위2: ...

[COMPARE]
비교 결과: 이미지가 없어 비교하지 못함

[GOOD]
- 학습 내용을 구조화하기 좋음
- 큰 가지와 하위 가지를 나누어 복습 가능

[IMPROVE]
- 학생이 직접 작성한 마인드맵이 있으면 비교 가능
- 예시나 세부 개념을 더 추가하면 좋음

[REVIEW]
- 큰 가지부터 말로 설명하며 복습하기
- 하위 가지를 연결해 한 문장으로 정리하기

[TAGS]
핵심개념, 구조화, 복습
`.trim()
    };
  }

  if (mode === "quiz") {
    return {
      system: baseSystem,
      temperature: 0.7,
      prompt: `
다음 학습 내용을 바탕으로 간단한 퀴즈를 만들어 주세요.

학습 내용:
${content}

[조건]
- 객관식 3문항 + 정답
- 서술형 2문항
- 중학생이 이해하기 쉽게
`.trim()
    };
  }

  return {
    system: baseSystem,
    temperature: 0.7,
    prompt: `
다음 학습 내용을 ${
      mode === "summary" ? "3줄로 요약" : "쉽게 정리"
    }해 주세요.

학습 내용:
${content}

[조건]
- 핵심 위주
- 학생이 복습할 수 있게 간단명료하게
`.trim()
  };
}

function formatTaskList(tasks) {
  if (!Array.isArray(tasks) || !tasks.length) return "- 없음";

  return tasks
    .map((t, i) => {
      return [
        `${i + 1}. 제목: ${safe(t.title)}`,
        `   과목: ${safe(t.subject)}`,
        `   중요도: ${safe(t.importance)}`,
        `   긴급도: ${safe(t.urgency)}`,
        `   마감일: ${safe(t.due)}`,
        `   계획 시간(분): ${safe(t.minutes)}`,
        `   실제 시간(분): ${safe(t.actual)}`,
        `   결과: ${safe(t.result)}`
      ].join("\n");
    })
    .join("\n");
}

function pickImage(payload) {
  const candidates = [
    payload.imageDataUrl,
    payload.imageBase64,
    payload.imageUrl,
    payload.uploadedImage,
    payload.studentImage,
    payload.studentMindmapImage,
    payload.mindmapImage
  ];

  for (const item of candidates) {
    if (typeof item === "string" && item.trim()) {
      return item.trim();
    }
  }
  return null;
}

function safe(v) {
  if (v === null || v === undefined) return "";
  return String(v);
}
