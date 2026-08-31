import { NextRequest, NextResponse } from "next/server";
import {
  CERTIFICATION_EXAMS,
  DISCIPLINES,
  EXAM_QUESTIONS_PER_ATTEMPT,
  PASS_THRESHOLD_PERCENT,
  getExamPaper,
  getExamPaperFor,
  gradeExam,
  isDiscipline,
  resolveAttemptQuestions,
  type SubmittedAnswers,
} from "@/app/utils/myclaw/certificationExams";
import {
  EXAM_ATTEMPT_COOLDOWN_MS,
  EXAM_MAX_ATTEMPTS_PER_DAY,
  canAttemptExam,
  getAgentProgress,
  recordExamAttempt,
} from "@/app/utils/myclaw/progress";
import { MYCLAW_PRICES, paymentInfo, withMyClawPayment } from "@/app/utils/myclaw/x402";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

/**
 * GET - darmowy arkusz egzaminacyjny (discovery).
 * Agent musi poznac pytania zanim zaplaci za ocene, wiec ta metoda nie jest
 * objeta x402. Poprawne odpowiedzi nigdy nie opuszczaja serwera.
 *
 * Z parametrem `agentAddress` zwracamy KONKRETNY zestaw 8 pytan wylosowany dla
 * tego agenta w biezacym oknie - ten sam, ktory oceni POST. Bez adresu
 * zwracamy caly bank jako material do nauki.
 */
export async function GET(request: NextRequest) {
  const discipline = request.nextUrl.searchParams.get("discipline");
  const agentAddress = request.nextUrl.searchParams.get("agentAddress");

  if (!isDiscipline(discipline)) {
    return NextResponse.json(
      {
        error: "Invalid or missing 'discipline' query parameter",
        valid: DISCIPLINES,
        hint: "GET /api/myclaw/certify?discipline=trading&agentAddress=0x... returns the exam paper drawn for that agent",
      },
      { status: 400 }
    );
  }

  const bankSize = CERTIFICATION_EXAMS[discipline].length;
  const attemptPolicy = {
    questionsPerAttempt: EXAM_QUESTIONS_PER_ATTEMPT,
    bankSize,
    drawnPerAttempt: `${EXAM_QUESTIONS_PER_ATTEMPT} questions are drawn at random from a bank of ${bankSize}`,
    cooldownMs: EXAM_ATTEMPT_COOLDOWN_MS,
    maxAttemptsPer24h: EXAM_MAX_ATTEMPTS_PER_DAY,
    afterPassing: "no further attempts are accepted for that discipline",
  };

  if (agentAddress && !EVM_ADDRESS_RE.test(agentAddress)) {
    return NextResponse.json(
      { error: "Invalid 'agentAddress' query parameter (must be a valid Ethereum address)" },
      { status: 400 }
    );
  }

  if (!agentAddress) {
    const questions = getExamPaper(discipline);
    return NextResponse.json({
      discipline,
      mode: "study-set",
      note: `This is the full question bank (${bankSize} questions). Pass agentAddress to receive the ${EXAM_QUESTIONS_PER_ATTEMPT} questions that will actually be graded for your next attempt.`,
      exam: {
        questions,
        totalQuestions: questions.length,
        passThresholdPercent: PASS_THRESHOLD_PERCENT,
      },
      attemptPolicy,
      submit: {
        method: "POST",
        path: "/api/myclaw/certify",
        body: {
          discipline,
          agentAddress: "0x...",
          answers: "{ [questionId]: optionIndex } or an array of option indexes in question order",
        },
      },
      payment: paymentInfo(MYCLAW_PRICES.certification, "MyClaw certification exam grading"),
    });
  }

  const paper = getExamPaperFor(discipline, agentAddress);
  const [decision, progress] = await Promise.all([
    canAttemptExam(agentAddress, discipline),
    getAgentProgress(agentAddress, discipline),
  ]);

  return NextResponse.json({
    discipline,
    agentAddress,
    mode: "attempt-paper",
    exam: {
      questions: paper.questions,
      totalQuestions: paper.questions.length,
      passThresholdPercent: PASS_THRESHOLD_PERCENT,
      questionsToPass: Math.ceil((PASS_THRESHOLD_PERCENT / 100) * paper.questions.length),
      drawExpiresAt: paper.expiresAt,
      drawNote:
        "This draw is valid until drawExpiresAt. Submitting after that returns the next draw's questions as unanswered.",
    },
    attemptPolicy,
    attemptStatus: {
      allowed: decision.allowed,
      reason: decision.reason ?? null,
      message: decision.message ?? null,
      nextAttemptAt: decision.nextAttemptAt ?? null,
      attemptsLast24h: decision.attemptsLast24h,
      attemptsRemainingToday: decision.attemptsRemainingToday,
      totalAttempts: decision.totalAttempts,
      limitsEnforced: decision.storeAvailable,
    },
    progress: {
      completedLessons: progress.completedLessons,
      passedChallenges: progress.passedChallenges,
      certified: progress.certified,
      certifiedAt: progress.certifiedAt,
    },
    submit: {
      method: "POST",
      path: "/api/myclaw/certify",
      body: {
        discipline,
        agentAddress,
        answers: "{ [questionId]: optionIndex } or an array of option indexes in question order",
      },
    },
    payment: paymentInfo(MYCLAW_PRICES.certification, "MyClaw certification exam grading"),
  });
}

/**
 * POST - faktyczna ocena egzaminu.
 *
 * KOLEJNOSC MA ZNACZENIE FINANSOWE: limity podejsc sprawdzamy PRZED ocena
 * i przed czymkolwiek innym, a odmowe zwracamy jako 429. withX402 rozlicza
 * platnosc dopiero po odpowiedzi handlera i tylko gdy jej status < 400
 * (handleSettlement w @x402/next wola cancellationDispatcher.cancel dla
 * status >= 400), wiec 429 anuluje settlement - agent nie placi za probe,
 * na ktora mu nie pozwolono.
 */
async function handleCertify(request: NextRequest): Promise<NextResponse> {
  let body: { discipline?: unknown; agentAddress?: unknown; answers?: SubmittedAnswers };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: "Invalid JSON body",
        expected: { discipline: "string", agentAddress: "0x...", answers: "{ questionId: optionIndex }" },
      },
      { status: 400 }
    );
  }

  if (!isDiscipline(body.discipline)) {
    return NextResponse.json({ error: "Invalid or missing discipline", valid: DISCIPLINES }, { status: 400 });
  }
  const discipline = body.discipline;

  if (typeof body.agentAddress !== "string" || !EVM_ADDRESS_RE.test(body.agentAddress)) {
    return NextResponse.json(
      { error: "Invalid or missing agentAddress (must be a valid Ethereum address)" },
      { status: 400 }
    );
  }
  const agentAddress = body.agentAddress;

  // --- BRAMKA: limity podejsc, ZAWSZE przed ocena i przed settlementem ---
  const decision = await canAttemptExam(agentAddress, discipline);
  if (!decision.allowed) {
    const retryAfterSeconds =
      decision.nextAttemptAt && decision.nextAttemptAt > Date.now()
        ? Math.ceil((decision.nextAttemptAt - Date.now()) / 1000)
        : null;

    return NextResponse.json(
      {
        error: "Exam attempt rejected",
        discipline,
        agentAddress,
        reason: decision.reason,
        message: decision.message,
        nextAttemptAt: decision.nextAttemptAt ?? null,
        nextAttemptAtISO: decision.nextAttemptAt ? new Date(decision.nextAttemptAt).toISOString() : null,
        attemptsLast24h: decision.attemptsLast24h,
        attemptsRemainingToday: decision.attemptsRemainingToday,
        totalAttempts: decision.totalAttempts,
        policy: {
          cooldownMs: EXAM_ATTEMPT_COOLDOWN_MS,
          maxAttemptsPer24h: EXAM_MAX_ATTEMPTS_PER_DAY,
          afterPassing: "no further attempts are accepted for that discipline",
        },
        billing:
          "This response is 429, so no x402 settlement takes place - you were not charged for the rejected attempt.",
      },
      {
        status: 429,
        headers: retryAfterSeconds ? { "Retry-After": String(retryAfterSeconds) } : undefined,
      }
    );
  }

  // Zestaw pytan tego podejscia: losowany deterministycznie z (adres, dyscyplina,
  // okno czasowe), z tolerancja na przekroczenie granicy okna miedzy GET a POST.
  const { questions } = resolveAttemptQuestions(discipline, agentAddress, body.answers ?? null);

  // Brak odpowiedzi to nie blad zadania - to nieudany egzamin. Zwracamy 200,
  // zeby przy aktywnym x402 platnosc byla rozliczona za faktycznie wykonana
  // ocene, a agent dostal jasna informacje, czego brakuje.
  const grade = gradeExam(discipline, body.answers ?? null, questions);

  const attemptedAt = Date.now();
  const recorded = await recordExamAttempt(agentAddress, discipline, {
    attemptedAt,
    score: grade.score,
    total: grade.total,
    percentage: grade.percentage,
    passed: grade.passed,
    questionIds: grade.questionIds,
  });

  const progress = await getAgentProgress(agentAddress, discipline);
  const attemptsLast24h = decision.attemptsLast24h + 1;

  return NextResponse.json({
    discipline,
    agentAddress,
    certification: {
      passed: grade.passed,
      score: grade.score,
      total: grade.total,
      percentage: grade.percentage,
      passThresholdPercent: grade.thresholdPercent,
      answered: grade.answered,
      unanswered: grade.unanswered,
      questionIds: grade.questionIds,
      reviewTopics: grade.reviewTopics,
      missing: grade.missing,
      certificateId: grade.passed ? `cert-${discipline}-${agentAddress.slice(2, 10)}-${attemptedAt}` : null,
      badge: grade.passed ? discipline : null,
      onchain: {
        minted: false,
        note: "Soulbound ERC-721 minting on Base is not wired up yet. certificateId is an off-chain receipt only.",
      },
    },
    attempt: {
      attemptedAt,
      recorded,
      attemptsLast24h,
      attemptsRemainingToday: Math.max(0, EXAM_MAX_ATTEMPTS_PER_DAY - attemptsLast24h),
      totalAttempts: decision.totalAttempts + 1,
      nextAttemptAt: grade.passed ? null : attemptedAt + EXAM_ATTEMPT_COOLDOWN_MS,
      note: grade.passed
        ? "Passed - this discipline is now closed, further attempts return 429."
        : `Cooldown of ${EXAM_ATTEMPT_COOLDOWN_MS / 1000}s applies before the next attempt.`,
    },
    progress: {
      completedLessons: progress.completedLessons,
      passedChallenges: progress.passedChallenges,
      examAttempts: progress.examAttempts.length,
      certified: progress.certified,
      certifiedAt: progress.certifiedAt,
    },
    verification: {
      examAnswers: "verified — graded against the server-side answer key",
      questionSelection: `verified — ${grade.total} questions drawn at random from a bank of ${CERTIFICATION_EXAMS[discipline].length}; the drawn ids are recorded in the attempt log`,
      lessonCompletion: `recorded — ${progress.completedLessons.length} lesson(s) of this discipline fetched by this agent (informational; lesson completion is NOT a precondition for certifying)`,
      challengeHistory: `recorded — ${progress.passedChallenges.length} challenge(s) passed, ${progress.challengeLog.length} attempt(s) logged`,
      retryLimit: decision.storeAvailable
        ? `enforced — ${EXAM_ATTEMPT_COOLDOWN_MS / 1000}s cooldown, max ${EXAM_MAX_ATTEMPTS_PER_DAY} attempts per 24h, none after passing`
        : "NOT enforced for this request — the progress store could not be read, so the attempt was allowed (fail-open)",
      attemptPersistence: recorded
        ? "verified — this attempt was written to the agentProgress store"
        : "FAILED — the attempt could not be written, so it does not count against the retry limit",
      onchainCertificate: "not verified — soulbound minting on Base is not wired up",
    },
    payment: paymentInfo(MYCLAW_PRICES.certification, "MyClaw certification exam grading"),
  });
}

export const POST = withMyClawPayment(handleCertify, {
  price: MYCLAW_PRICES.certification,
  description: "MyClaw Academy certification exam grading",
});
