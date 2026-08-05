import { NextRequest, NextResponse } from "next/server";
import {
  DISCIPLINES,
  PASS_THRESHOLD_PERCENT,
  getExamPaper,
  gradeExam,
  isDiscipline,
  type SubmittedAnswers,
} from "@/app/utils/myclaw/certificationExams";
import { MYCLAW_PRICES, paymentInfo, withMyClawPayment } from "@/app/utils/myclaw/x402";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET - darmowy arkusz egzaminacyjny (discovery).
 * Agent musi poznac pytania zanim zaplaci za ocene, wiec ta metoda nie jest
 * objeta x402. Poprawne odpowiedzi nigdy nie opuszczaja serwera.
 */
export async function GET(request: NextRequest) {
  const discipline = request.nextUrl.searchParams.get("discipline");

  if (!isDiscipline(discipline)) {
    return NextResponse.json(
      {
        error: "Invalid or missing 'discipline' query parameter",
        valid: DISCIPLINES,
        hint: "GET /api/myclaw/certify?discipline=trading returns the exam paper for that discipline",
      },
      { status: 400 }
    );
  }

  const questions = getExamPaper(discipline);

  return NextResponse.json({
    discipline,
    exam: {
      questions,
      totalQuestions: questions.length,
      passThresholdPercent: PASS_THRESHOLD_PERCENT,
      questionsToPass: Math.ceil((PASS_THRESHOLD_PERCENT / 100) * questions.length),
    },
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

/**
 * POST - faktyczna ocena egzaminu.
 *
 * Wczesniej ta trasa zwracala passed: true bezwarunkowo. Teraz odpowiedzi sa
 * realnie sprawdzane wzgledem banku pytan, a prog zaliczenia to 70%.
 *
 * CZEGO NIE DA SIE ZWERYFIKOWAC BEZ TRWALEGO MAGAZYNU:
 *  - czy agent faktycznie przeczytal lekcje (brak zapisu ukonczenia lekcji),
 *  - czy zdal challenge z danej dyscypliny (wyniki challenge nie sa zapisywane),
 *  - czy nie powtarza tego samego egzaminu az do trafienia (brak historii prob),
 *  - mint certyfikatu SBT na Base (brak integracji z kontraktem).
 * Oceniamy wylacznie to, co realnie przychodzi w zadaniu.
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

  if (typeof body.agentAddress !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(body.agentAddress)) {
    return NextResponse.json(
      { error: "Invalid or missing agentAddress (must be a valid Ethereum address)" },
      { status: 400 }
    );
  }
  const agentAddress = body.agentAddress;

  // Brak odpowiedzi to nie blad zadania - to nieudany egzamin. Zwracamy 200,
  // zeby przy aktywnym x402 platnosc byla rozliczona za faktycznie wykonana
  // ocene, a agent dostal jasna informacje, czego brakuje.
  const grade = gradeExam(discipline, body.answers ?? null);

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
      reviewTopics: grade.reviewTopics,
      missing: grade.missing,
      certificateId: grade.passed ? `cert-${discipline}-${agentAddress.slice(2, 10)}-${Date.now()}` : null,
      badge: grade.passed ? discipline : null,
      onchain: {
        minted: false,
        note: "Soulbound ERC-721 minting on Base is not wired up yet. certificateId is an off-chain receipt only and is not persisted server-side.",
      },
    },
    verification: {
      examAnswers: "verified",
      lessonCompletion: "not verified - no progress store; lesson reads are not recorded per agent",
      challengeHistory: "not verified - challenge results are not persisted",
      retryLimit: "not enforced - no attempt history",
    },
    payment: paymentInfo(MYCLAW_PRICES.certification, "MyClaw certification exam grading"),
  });
}

export const POST = withMyClawPayment(handleCertify, {
  price: MYCLAW_PRICES.certification,
  description: "MyClaw Academy certification exam grading",
});
