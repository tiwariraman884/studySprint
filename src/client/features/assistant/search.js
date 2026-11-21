/* Syllabus retrieval and conversational follow-ups. No generated facts. */
const StudySearch = (() => {
  const aliases = {
    de: ["digital electronics", "digital electronic", "de", "ect033"],
    cpp: [
      "object oriented programming",
      "object oriented",
      "c++",
      "cpp",
      "oop",
      "cst004",
      "cso053",
    ],
    alg: [
      "discrete structures",
      "discrete structure",
      "discrete mathematics",
      "dstl",
      "cst002",
    ],
    dsa: [
      "data structures and algorithms",
      "data structure and algorithm",
      "data structures",
      "dsa",
      "cst003",
    ],
    uhv: ["universal human values", "human values", "uhv", "aht008"],
    py: [
      "python programming lab",
      "python programming",
      "python lab",
      "python",
      "csp005",
      "csp 005",
    ],
  };
  const stop = new Set(
    "a an the and or of to in on at for from with without about as is are was were be it its this that these those what which how why when can could would should do does did please explain explore give show tell me my more details detail detailed simply simple easy language example examples question questions short long answer answers mark marks solve solved solution solutions step steps by using study notes topic topics chapter chapters unit units samjhao batao kya hai hain mujhe isko ise aur detail mein".split(
      " ",
    ),
  );
  function normalize(text) {
    return String(text || "")
      .toLowerCase()
      .normalize("NFKC")
      .replace(/c plus plus|cplusplus|\bcpp\b/g, "c++")
      .replace(/fan[\s-]*out/g, "fan out")
      .replace(/fan[\s-]*in/g, "fan in")
      .replace(/semi[\s-]*conductor/g, "semiconductor")
      .replace(/&/g, " and ")
      .replace(/[–—-]/g, " ")
      .replace(/[^a-z0-9+\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  const words = (text) =>
    normalize(text)
      .split(" ")
      .filter((w) => w && !stop.has(w));
  const stem = (w) =>
    w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w;
  const contains = (text, phrase) =>
    (" " + text + " ").includes(" " + phrase + " ");
  function subjectOf(q) {
    const n = normalize(q);
    return Object.keys(aliases).find((id) =>
      aliases[id].some((a) => contains(n, a)),
    );
  }
  function near(a, b) {
    if (a === b) return true;
    if (Math.min(a.length, b.length) < 5 || Math.abs(a.length - b.length) > 1)
      return false;
    let i = 0,
      j = 0,
      changes = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) {
        i++;
        j++;
        continue;
      }
      if (++changes > 1) return false;
      if (a.length >= b.length) i++;
      if (b.length >= a.length) j++;
    }
    return changes + (i < a.length || j < b.length ? 1 : 0) <= 1;
  }
  function retrieve(q, topics) {
    const subject = subjectOf(q),
      n = normalize(q);
    let query = n;
    if (subject)
      for (const alias of aliases[subject])
        query = (" " + query + " ").replace(" " + alias + " ", " ").trim();
    const terms = [...new Set(words(query).map(stem))];
    if (!terms.length) return [];
    return topics
      .filter((t) => !subject || t.subject === subject)
      .map((t) => {
        const title = words(t.title).map(stem);
        const body = words(
          [t.brief, t.recall, ...(t.points || []), t.question].join(" "),
        ).map(stem);
        let titleMatches = 0,
          matches = 0;
        const score = terms.reduce((sum, term) => {
          if (title.includes(term)) {
            titleMatches++;
            matches++;
            return sum + 6;
          }
          if (title.some((w) => near(term, w))) {
            titleMatches++;
            matches++;
            return sum + 4;
          }
          if (body.includes(term)) {
            matches++;
            return sum + 1;
          }
          return sum;
        }, 0);
        const phrase = contains(n, normalize(t.title)) ? 20 : 0;
        return { t, score: score + phrase, titleMatches, matches };
      })
      .filter((x) => x.titleMatches > 0 || x.matches >= 2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((x) => x.t);
  }
  function previousContext(history, topics) {
    const last = [...history].reverse().find((m) => m.role === "assistant");
    if (!last) return null;
    if (last.contextTopicId && topics.some((t) => t.id === last.contextTopicId))
      return { kind: "topic", id: last.contextTopicId };
    if (aliases[last.contextSubjectId])
      return { kind: "subject", id: last.contextSubjectId };
    if (last.kind === "plan") return { kind: "plan" };
    // Read answers saved before conversational context was introduced.
    if (!last.kind && last.mode === "search") {
      const t = topics.find((t) => t.id === last.sources?.[0]);
      if (t && last.text?.startsWith(t.title + "\n"))
        return { kind: "topic", id: t.id };
      if (last.text?.startsWith("Your plan:")) return { kind: "plan" };
    }
    return null;
  }
  function intent(q) {
    const n = normalize(q);
    if (/\blong\b|\b10 marks?\b/.test(n)) return "long";
    if (/\bshort questions?\b|\bpractice questions?\b|\b5 marks?\b/.test(n))
      return "short";
    if (/\bexample|\bnumerical|\bstep by step\b/.test(n)) return "example";
    if (/\bsimpl|\bhinglish\b|\bhindi\b|\bsamjhao\b/.test(n)) return "simple";
    return "explore";
  }
  function resolve(q, history, topics) {
    const n = normalize(q);
    if (
      /help me debug|traceback|#include|\bIndexError\b|\bSyntaxError\b/i.test(
        q,
      ) ||
      /```/.test(q)
    )
      return { kind: "code", hits: [] };
    if (/^(hi|hello|hey|namaste|help|help me|start)$/.test(n))
      return { kind: "welcome", hits: [] };
    if (/^explore( a| the)? subjects?$/.test(n))
      return { kind: "clarify", hits: [] };
    if (
      /\b(my plan|study plan|study schedule|my progress|study next|should i study|priorities|my weak|revision plan)\b/.test(
        n,
      ) ||
      /^(plan|schedule|progress|priorities)$/.test(n)
    )
      return { kind: "plan", hits: [] };
    const subject = subjectOf(q),
      hits = retrieve(q, topics);
    const follow =
      /^(explore( it| this| that| more)?( in detail)?|explain( it| this| that)?( more| again| in detail| simply| in simple words)?|tell me more( about (it|this|that))?|go deeper|continue|more( details?| examples?)?|why|how|give( me)?( an?| more)? examples?( of (it|this|that))?|show( me)?( a)? worked example|give( me)?( short| long| practice)? questions?( on (it|this|that))?|isko samjhao|aur batao)$/.test(
        n,
      );
    if (follow && !hits.length && !subject) {
      const context = previousContext(history, topics);
      if (context?.kind === "topic")
        return {
          kind: "topic",
          hits: [topics.find((t) => t.id === context.id)],
          followup: true,
          intent: intent(q),
        };
      if (context?.kind === "subject")
        return {
          kind: "subject",
          subject: context.id,
          hits: [],
          followup: true,
        };
      if (context?.kind === "plan")
        return { kind: "plan", hits: [], followup: true };
      return { kind: "clarify", hits: [] };
    }
    if (subject && !hits.length) return { kind: "subject", subject, hits: [] };
    if (hits.length) return { kind: "topic", hits, intent: intent(q) };
    return { kind: "unmatched", hits: [] };
  }
  function subjectSuggestions(subjects) {
    return subjects.map((s) => ({
      label: s.name,
      prompt: "Explore " + s.name,
    }));
  }
  function reply(
    route,
    { topics, subjects, shortBank, longBank, hinglish, planText, priorities },
  ) {
    const choose = subjectSuggestions(subjects);
    if (route.kind === "plan")
      return {
        kind: "plan",
        text:
          planText +
          "\n\nStart with the first priority: read its essentials, solve the example, then recall the key points without looking. Change days, hours or subjects in Study plan to fit the remaining workload.",
        sources: priorities.slice(0, 3).map((t) => t.id),
        suggestions: priorities
          .slice(0, 3)
          .map((t) => ({ label: t.title, prompt: "Explore " + t.title })),
      };
    if (route.kind === "subject") {
      const subject = subjects.find((s) => s.id === route.subject);
      const ts = topics.filter((t) => t.subject === route.subject);
      const units = [...new Set(ts.map((t) => t.unit))].sort((a, b) => a - b);
      const selected = units.map((unit) => ts.find((t) => t.unit === unit));
      return {
        kind: "subject",
        contextSubjectId: subject.id,
        text: `Let's explore ${subject.name}.\n\n${ts.length} topic guides across ${units.length} chapters / exercises. Choose a starting topic below, or type a concept from this subject.\n\n${selected.map((t) => `• ${t.subject === "py" ? "Exercise" : "Unit"} ${t.unit} — start with ${t.title}`).join("\n")}\n\nYou can ask for an explanation, a worked example, or short and long practice questions.`,
        sources: [],
        suggestions: selected.map((t) => ({
          label: t.title,
          prompt: "Explore " + t.title,
        })),
      };
    }
    if (route.kind === "clarify" || route.kind === "welcome")
      return {
        kind: route.kind,
        text:
          route.kind === "clarify"
            ? "Sure — which subject or topic would you like to explore?\n\nChoose one below. After we discuss a topic, “explore it”, “explain more” and “give an example” will continue that topic."
            : "Hi Raman. Choose a subject to explore, ask a specific question, or check what to study next.",
        sources: [],
        suggestions: [
          ...choose,
          {
            label: "What should I study next?",
            prompt: "What should I study next?",
          },
        ],
      };
    if (route.kind === "code")
      return {
        kind: "code",
        text: "This is a code-debugging question. Syllabus search cannot diagnose arbitrary code.\n\nRun it in Smart lab to see the actual compiler/runtime error and instant error hints. The optional on-device AI can draft an explanation, but its suggestions need checking. You can also ask me about a specific programming concept below.",
        sources: [],
        suggestions: [
          {
            label: "Exception handling",
            prompt: "Explain C++ exception handling",
          },
          { label: "Python basics", prompt: "Explore Python Programming Lab" },
        ],
      };
    if (route.kind !== "topic")
      return {
        kind: "unmatched",
        text: "I haven’t matched that wording to a syllabus topic yet. Which subject is it from?\n\nChoose a subject below, or include the concept name in your question. I can explain the stored notes and work through their examples. Open-ended questions outside these materials need the optional AI.",
        sources: [],
        suggestions: choose,
      };
    const t = route.hits[0],
      heading = route.followup ? `Continuing: ${t.title}` : t.title;
    const numbered = (items) =>
      items.map((p, i) => `${i + 1}. ${p}`).join("\n");
    let body;
    if (route.intent === "example")
      body = `Worked example\n${t.question}\n\n${numbered(t.steps)}\n\nRemember: ${t.recall}`;
    else if (route.intent === "simple")
      body = `${t.brief}\n\n${hinglish && t.hinglish ? "Simple Hinglish: " + t.hinglish + "\n\n" : ""}Remember: ${t.recall}\n\nTry explaining this point in your own words before opening the worked example.`;
    else if (route.intent === "short") {
      const qs = shortBank.filter((q) => q.topicId === t.id || q.id === t.id);
      body = `Short practice for this topic\n\n${(qs.length
        ? qs
        : [{ prompt: t.question, steps: t.steps, marks: 5 }]
      )
        .slice(0, 3)
        .map(
          (q) =>
            `${q.marks || 5} marks · ${q.prompt}\n\nSolution:\n${numbered(q.steps)}`,
        )
        .join("\n\n")}`;
    } else if (route.intent === "long") {
      const q =
        longBank.find((q) => q.related?.includes(t.id)) ||
        longBank.find((q) => q.subject === t.subject && q.unit === t.unit);
      body = q
        ? `Related chapter practice · 10 marks\n${q.title}\n${q.prompt}\n\n${numbered(q.sections.map(([title, body]) => title + ": " + body))}\n\nOpen Long answers to write your answer and check it against the marking rubric.`
        : "There is no saved long answer linked to this topic yet. Use its worked example, or open Long answers to select another chapter.";
    } else
      body = `${t.brief}\n\nKey exam points\n${numbered(t.points)}\n\nQuick recall: ${t.recall}\n\nWorked example\n${t.question}\n${numbered(t.steps)}${hinglish && t.hinglish ? "\n\nSimple Hinglish: " + t.hinglish : ""}\n\nSelf-check: cover the solution, answer the question, then compare each step.`;
    return {
      kind: "topic",
      contextTopicId: t.id,
      text: heading + "\n\n" + body,
      sources: route.hits.map((x) => x.id),
      suggestions: [
        { label: "Explain simply", prompt: "Explain " + t.title + " simply" },
        {
          label: "Worked example",
          prompt: "Show a worked example for " + t.title,
        },
        {
          label: "Short questions",
          prompt: "Give short questions on " + t.title,
        },
        { label: "Long answer", prompt: "Give a long answer on " + t.title },
      ],
    };
  }
  function restoreMessage(m, topics, subjects) {
    return {
      ...m,
      kind: [
        "topic",
        "subject",
        "plan",
        "welcome",
        "clarify",
        "unmatched",
        "code",
      ].includes(m.kind)
        ? m.kind
        : undefined,
      contextTopicId: topics.some((t) => t.id === m.contextTopicId)
        ? m.contextTopicId
        : undefined,
      contextSubjectId: subjects.some((s) => s.id === m.contextSubjectId)
        ? m.contextSubjectId
        : undefined,
      suggestions: Array.isArray(m.suggestions)
        ? m.suggestions
            .filter(
              (x) =>
                typeof x.label === "string" && typeof x.prompt === "string",
            )
            .slice(0, 12)
            .map((x) => ({
              label: x.label.slice(0, 100),
              prompt: x.prompt.slice(0, 300),
            }))
        : [],
    };
  }
  return { retrieve, resolve, reply, restoreMessage };
})();

export { StudySearch };
