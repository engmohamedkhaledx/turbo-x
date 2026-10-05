"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import Navbar from "@/components/Navbar";
import Loading from "@/components/Loading";
import type { Profile, Question, Quiz } from "@/lib/types";

type AnswerMap = Record<number, string>;

type QuizResult = {
  score: number;
  totalPoints: number;
  percentage: number;
  correct: number;
  wrong: number;
};

export default function QuizPage() {
  const params = useParams();
  const router = useRouter();

  const supabase = supabaseBrowser();

  const quizId = Number(params.id);

  const [loading, setLoading] = useState(true);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState("");

  const [answers, setAnswers] = useState<AnswerMap>({});
  const [currentQuestion, setCurrentQuestion] = useState(0);

  // null = No Limit
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [alreadyAttempted, setAlreadyAttempted] = useState(false);

  /*
   * Load quiz
   */
  useEffect(() => {
    const loadQuiz = async () => {
      try {
        setLoading(true);

        // Get logged-in user
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          router.replace("/login");
          return;
        }

        /*
         * Load profile
         */
        const { data: profileData, error: profileError } =
          await supabase
            .from("profiles")
            .select("*")
            .eq("id", user.id)
            .single();

        if (profileError || !profileData) {
          console.error(profileError);
          router.replace("/login");
          return;
        }

        setProfile(profileData as Profile);
        setEmail(user.email ?? "");

        /*
         * Admin should not access student quiz page
         */
        if (profileData.role === "admin") {
          router.replace("/admin");
          return;
        }

        /*
         * Load published quiz
         */
        const { data: quizData, error: quizError } = await supabase
          .from("quizzes")
          .select("*")
          .eq("id", quizId)
          .eq("published", true)
          .single();

        if (quizError || !quizData) {
          console.error(quizError);
          router.replace("/dashboard");
          return;
        }

        setQuiz(quizData as Quiz);

        const { data: existingAttempt, error: existingAttemptError } =
          await supabase
            .from("quiz_attempts")
            .select("id")
            .eq("quiz_id", quizId)
            .eq("student_id", profileData.id)
            .limit(1);

        if (existingAttemptError) {
          console.error(existingAttemptError);
        }

        if ((existingAttempt ?? []).length > 0) {
          setAlreadyAttempted(true);
          setLoading(false);
          return;
        }

        /*
         * Load questions
         */
        const { data: questionData, error: questionError } =
          await supabase
            .from("questions")
            .select("*")
            .eq("quiz_id", quizId)
            .order("id", { ascending: true });

        if (questionError) {
          console.error(questionError);
          setQuestions([]);
        } else {
          setQuestions((questionData ?? []) as Question[]);
        }

        /*
         * Initialize timer
         *
         * NULL = No Limit
         */
        if (
          quizData.duration_minutes !== null &&
          Number(quizData.duration_minutes) > 0
        ) {
          setTimeLeft(Number(quizData.duration_minutes) * 60);
        } else {
          setTimeLeft(null);
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    if (!Number.isNaN(quizId)) {
      loadQuiz();
    }
  }, [quizId, router, supabase]);

  /*
   * Submit quiz
   */
  const handleSubmit = useCallback(async () => {
    if (!profile || !quiz || submitting || result || alreadyAttempted || alreadyAttempted) {
      return;
    }

    try {
      setSubmitting(true);
      setShowSubmitModal(false);

      let score = 0;
      let totalPoints = 0;
      let correct = 0;
      let wrong = 0;

      for (const question of questions) {
        totalPoints += Number(question.points);

        const selectedAnswer = answers[question.id];

        if (
          selectedAnswer !== undefined &&
          selectedAnswer === question.correct_answer
        ) {
          score += Number(question.points);
          correct++;
        } else {
          wrong++;
        }
      }

      const percentage =
        totalPoints > 0
          ? Math.round((score / totalPoints) * 100)
          : 0;

      /*
       * Save attempt
       */
      const { error } = await supabase.rpc("submit_quiz_attempt", {
        p_quiz_id: quiz.id,
        p_student_id: profile.id,
        p_answers: Object.fromEntries(
          questions.map((question) => [
            String(question.id),
            answers[question.id] ?? null,
          ])
        ),
      });

      if (error) {
        console.error(error);
        alert("Something went wrong while saving your result.");
        setSubmitting(false);
        return;
      }

      setResult({
        score,
        totalPoints,
        percentage,
        correct,
        wrong,
      });
      setAlreadyAttempted(true);
    } catch (error) {
      console.error(error);
      alert("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [
    answers,
    profile,
    questions,
    quiz,
    result,
    submitting,
    alreadyAttempted,
    supabase,
  ]);

  /*
   * Timer
   */
  useEffect(() => {
    if (
      loading ||
      !quiz ||
      questions.length === 0 ||
      result ||
      timeLeft === null
    ) {
      return;
    }

    if (timeLeft <= 0) {
      handleSubmit();
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((previous) => {
        if (previous === null) {
          return null;
        }

        if (previous <= 1) {
          return 0;
        }

        return previous - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [
    loading,
    quiz,
    questions.length,
    result,
    timeLeft,
    handleSubmit,
  ]);

  /*
   * Current question
   */
  const current = questions[currentQuestion];

  const reviewedQuestions = questions.map((question) => {
    const selectedAnswer = answers[question.id];
    const isCorrect = selectedAnswer === question.correct_answer;

    return {
      ...question,
      selectedAnswer,
      isCorrect,
    };
  });

  /*
   * Answer statistics
   */
  const answeredCount = Object.keys(answers).length;

  const unansweredCount = Math.max(
    questions.length - answeredCount,
    0
  );

  /*
   * Progress
   */
  const progressPercentage =
    questions.length > 0
      ? Math.round(
          ((currentQuestion + 1) / questions.length) * 100
        )
      : 0;

  /*
   * Timer formatting
   */
  const formattedTime = useMemo(() => {
    if (timeLeft === null) {
      return "No Limit";
    }

    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;

    return `${String(minutes).padStart(2, "0")}:${String(
      seconds
    ).padStart(2, "0")}`;
  }, [timeLeft]);

  /*
   * Timer warning
   */
  const timerWarning =
    timeLeft !== null && timeLeft <= 60;

  /*
   * Select answer
   */
  const selectAnswer = (answer: string) => {
    if (!current || result) {
      return;
    }

    setAnswers((previous) => ({
      ...previous,
      [current.id]: answer,
    }));
  };

  /*
   * Next question
   */
  const goNext = () => {
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion((previous) => previous + 1);
    }
  };

  /*
   * Previous question
   */
  const goPrevious = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion((previous) => previous - 1);
    }
  };

  /*
   * Question status
   */
  const getQuestionStatus = (index: number) => {
    const question = questions[index];

    if (!question) {
      return "unanswered";
    }

    if (answers[question.id]) {
      return "answered";
    }

    return "unanswered";
  };

  /*
   * Navbar
   */
  const navbar = (
    <Navbar
      role={profile?.role ?? "student"}
      name={profile?.full_name ?? "Student"}
      email={email}
    />
  );

  /*
   * Loading
   */
  if (loading) {
    return <Loading />;
  }

  /*
   * Quiz not found
   */
  if (!quiz) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        {navbar}

        <main className="flex min-h-[80vh] items-center justify-center px-6">
          <div className="text-center">
            <div className="mb-4 text-5xl">😕</div>

            <h1 className="text-2xl font-bold">
              Quiz Not Found
            </h1>

            <p className="mt-2 text-slate-400">
              This quiz may no longer be available.
            </p>

            <button
              onClick={() => router.push("/dashboard")}
              className="mt-6 rounded-xl bg-white px-6 py-3 font-semibold text-slate-950 transition hover:bg-slate-200"
            >
              Back to Dashboard
            </button>
          </div>
        </main>
      </div>
    );
  }

  /*
   * No questions
   */
  if (questions.length === 0 && !result) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        {navbar}

        <main className="flex min-h-[80vh] items-center justify-center px-6">
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur-xl">
            <div className="mb-4 text-5xl">📝</div>

            <h1 className="text-2xl font-bold">
              {quiz.title}
            </h1>

            <p className="mt-3 text-slate-400">
              This quiz does not contain any questions yet.
            </p>

            <button
              onClick={() => router.push("/dashboard")}
              className="mt-6 rounded-xl bg-white px-6 py-3 font-semibold text-slate-950"
            >
              Back to Dashboard
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (alreadyAttempted && !result) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        {navbar}

        <main className="flex min-h-[80vh] items-center justify-center px-6">
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur-xl">
            <div className="mb-4 text-5xl">✅</div>

            <h1 className="text-2xl font-bold">
              You already completed this quiz
            </h1>

            <p className="mt-3 text-slate-400">
              One attempt only is allowed for this exam.
            </p>

            <button
              onClick={() => router.push("/dashboard")}
              className="mt-6 rounded-xl bg-white px-6 py-3 font-semibold text-slate-950 transition hover:bg-slate-200"
            >
              Back to Dashboard
            </button>
          </div>
        </main>
      </div>
    );
  }

  /*
   * RESULT SCREEN
   */
  if (result) {
    const passed = result.percentage >= 50;

    return (
      <div className="min-h-screen bg-slate-950 text-white">
        {navbar}

        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-8 rounded-[28px] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-400">
                  Quiz summary
                </p>
                <h1 className="mt-3 text-4xl font-black tracking-tight text-white">
                  Your result
                </h1>
                <p className="mt-2 text-slate-400">
                  {quiz.title}
                </p>
              </div>

              <div
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${
                  passed
                    ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                    : "border border-amber-500/30 bg-amber-500/10 text-amber-300"
                }`}
              >
                <span>{passed ? "Passed" : "Needs review"}</span>
              </div>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                <div className="text-sm text-slate-400">Final score</div>
                <div className="mt-3 text-4xl font-black text-white">
                  {result.percentage}<span className="text-lg text-slate-500">%</span>
                </div>
              </div>

              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
                <div className="text-sm text-slate-400">Correct</div>
                <div className="mt-3 text-4xl font-black text-emerald-400">
                  {result.correct}
                </div>
              </div>

              <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5">
                <div className="text-sm text-slate-400">Wrong</div>
                <div className="mt-3 text-4xl font-black text-red-400">
                  {result.wrong}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                <div className="text-sm text-slate-400">Points</div>
                <div className="mt-3 text-4xl font-black text-white">
                  {result.score}<span className="text-lg text-slate-500">/{result.totalPoints}</span>
                </div>
              </div>
            </div>

            <div className="mt-8">
              <div className="mb-3 flex items-center justify-between text-sm text-slate-400">
                <span>Overall performance</span>
                <span className="font-semibold text-white">{result.percentage}%</span>
              </div>

              <div className="h-3 overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    passed ? "bg-emerald-400" : "bg-amber-400"
                  }`}
                  style={{ width: `${result.percentage}%` }}
                />
              </div>
            </div>
          </div>

          <div className="mt-8 rounded-[28px] border border-white/10 bg-white/5 p-6 shadow-xl backdrop-blur-xl sm:p-8">
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-2xl font-black text-white">Answer review</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Compare your answers with the correct ones below.
                </p>
              </div>

              <button
                onClick={() => router.push("/dashboard")}
                className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-slate-200"
              >
                Back to dashboard
              </button>
            </div>

            <div className="space-y-5">
              {reviewedQuestions.map((question, index) => {
                const selectedAnswer = question.selectedAnswer;
                const correctAnswer = question.correct_answer;
                const isCorrect = question.isCorrect;

                return (
                  <div
                    key={question.id}
                    className="rounded-2xl border border-white/10 bg-black/20 p-5"
                  >
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <p className="whitespace-pre-wrap break-words text-base font-bold leading-relaxed text-white">
                        {index + 1}. {question.question_text}
                      </p>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                          isCorrect
                            ? "bg-emerald-500/15 text-emerald-300"
                            : "bg-red-500/15 text-red-300"
                        }`}
                      >
                        {isCorrect ? "Correct" : "Wrong"}
                      </span>
                    </div>

                    <div className="space-y-2">
                      {question.options.map((option, optionIndex) => {
                        const letter = String.fromCharCode(65 + optionIndex);
                        const isSelected = selectedAnswer === option;
                        const isCorrectOption = correctAnswer === option;

                        return (
                          <div
                            key={`${question.id}-${optionIndex}`}
                            className={`rounded-xl border px-3 py-2 text-sm ${
                              isCorrectOption
                                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                                : isSelected
                                ? "border-red-500/40 bg-red-500/10 text-red-300"
                                : "border-white/10 bg-white/5 text-slate-300"
                            }`}
                          >
                            <span className="whitespace-pre-wrap break-words">
                              <span className="font-bold">{letter}.</span> {option}
                            </span>
                            {isCorrectOption && " • Correct answer"}
                            {isSelected && !isCorrectOption && " • Your answer"}
                          </div>
                        );
                      })}
                    </div>

                    {!isCorrect && (
                      <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-300">
                        Correct answer: <span className="whitespace-pre-wrap break-words font-bold">{correctAnswer}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </main>
      </div>
    );
  }

  /*
   * Main Quiz Screen
   */
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {navbar}

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Quiz Header */}
        <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="mb-1 text-sm font-medium text-slate-400">
                Quiz
              </p>

              <h1 className="text-2xl font-black sm:text-3xl">
                {quiz.title}
              </h1>

              {quiz.description && (
                <p className="mt-2 max-w-2xl text-sm text-slate-400">
                  {quiz.description}
                </p>
              )}
            </div>

            {/* Timer */}
            <div
              className={`rounded-2xl border px-5 py-3 text-center ${
                timerWarning
                  ? "border-red-500/40 bg-red-500/10"
                  : "border-white/10 bg-black/20"
              }`}
            >
              <div className="text-xs font-medium uppercase tracking-wider text-slate-400">
                Time Remaining
              </div>

              <div
                className={`mt-1 text-2xl font-black tabular-nums ${
                  timerWarning
                    ? "text-red-400"
                    : "text-white"
                }`}
              >
                {timeLeft !== null && "⏱ "}
                {formattedTime}
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-slate-400">
                Question {currentQuestion + 1} of{" "}
                {questions.length}
              </span>

              <span className="font-semibold">
                {progressPercentage}%
              </span>
            </div>

            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-white transition-all duration-300"
                style={{
                  width: `${progressPercentage}%`,
                }}
              />
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          {/* Question */}
          <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl backdrop-blur-xl sm:p-8">
            <div className="mb-8 flex items-start justify-between gap-4">
              <div>
                <div className="mb-3 inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-slate-300">
                  Question {currentQuestion + 1}
                </div>

                <h2 className="whitespace-pre-wrap break-words text-xl font-bold leading-relaxed sm:text-2xl">
                  {current?.question_text}
                </h2>
              </div>

              <div className="shrink-0 rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-slate-300">
                {current?.points}{" "}
                {current?.points === 1
                  ? "Point"
                  : "Points"}
              </div>
            </div>

            {/* Options */}
            <div className="space-y-3">
              {current?.options.map((option, index) => {
                const selected =
                  answers[current.id] === option;

                const letter = String.fromCharCode(
                  65 + index
                );

                return (
                  <button
                    key={`${current.id}-option-${index}`}
                    type="button"
                    onClick={() => selectAnswer(option)}
                    className={`group flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition ${
                      selected
                        ? "border-white bg-white text-slate-950 shadow-lg"
                        : "border-white/10 bg-black/10 text-white hover:border-white/30 hover:bg-white/10"
                    }`}
                  >
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-black ${
                        selected
                          ? "bg-slate-950 text-white"
                          : "bg-white/10 text-slate-300 group-hover:bg-white/20"
                      }`}
                    >
                      {letter}
                    </span>

                    <span className="flex-1 whitespace-pre-wrap break-words font-medium">
                      {option}
                    </span>

                    {selected && (
                      <span className="text-lg">
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Navigation */}
            <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={goPrevious}
                disabled={currentQuestion === 0}
                className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 font-semibold transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
              >
                ← Previous
              </button>

              {currentQuestion < questions.length - 1 ? (
                <button
                  type="button"
                  onClick={goNext}
                  className="rounded-xl bg-white px-6 py-3 font-bold text-slate-950 transition hover:bg-slate-200"
                >
                  Next →
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    setShowSubmitModal(true)
                  }
                  className="rounded-xl bg-white px-6 py-3 font-bold text-slate-950 transition hover:bg-slate-200"
                >
                  Review & Submit
                </button>
              )}
            </div>
          </section>

          {/* Question Navigator */}
          <aside className="h-fit rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl lg:sticky lg:top-6">
            <div className="mb-5">
              <h3 className="font-bold">
                Questions
              </h3>

              <p className="mt-1 text-xs text-slate-400">
                Navigate through the quiz
              </p>
            </div>

            {/* Question Grid */}
            <div className="grid grid-cols-5 gap-2 sm:grid-cols-6 lg:grid-cols-4">
              {questions.map((question, index) => {
                const status =
                  getQuestionStatus(index);

                const active =
                  currentQuestion === index;

                return (
                  <button
                    key={question.id}
                    type="button"
                    onClick={() =>
                      setCurrentQuestion(index)
                    }
                    className={`relative flex h-11 w-full items-center justify-center rounded-xl text-sm font-bold transition ${
                      active
                        ? "bg-white text-slate-950 ring-2 ring-white/30"
                        : status === "answered"
                        ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                        : "bg-white/5 text-slate-400 hover:bg-white/10"
                    }`}
                  >
                    {index + 1}

                    {status === "answered" && (
                      <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[9px] text-white">
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="mt-6 space-y-3 border-t border-white/10 pt-5 text-xs">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded bg-white" />
                <span className="text-slate-400">
                  Current
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded bg-emerald-500/60" />
                <span className="text-slate-400">
                  Answered
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded bg-white/10" />
                <span className="text-slate-400">
                  Not Answered
                </span>
              </div>
            </div>

            {/* Stats */}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-emerald-500/5 p-3 text-center">
                <div className="text-xl font-black text-emerald-400">
                  {answeredCount}
                </div>

                <div className="text-[10px] uppercase tracking-wide text-slate-500">
                  Answered
                </div>
              </div>

              <div className="rounded-xl bg-white/5 p-3 text-center">
                <div className="text-xl font-black text-slate-300">
                  {unansweredCount}
                </div>

                <div className="text-[10px] uppercase tracking-wide text-slate-500">
                  Remaining
                </div>
              </div>
            </div>

            {/* Submit */}
            <button
              type="button"
              onClick={() =>
                setShowSubmitModal(true)
              }
              className="mt-5 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-bold transition hover:bg-white/15"
            >
              Review & Submit
            </button>
          </aside>
        </div>
      </main>

      {/* Submit Confirmation Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl sm:p-8">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-2xl">
              ⚠️
            </div>

            <h2 className="text-2xl font-black">
              Submit Quiz?
            </h2>

            <p className="mt-3 leading-relaxed text-slate-400">
              Are you sure you want to submit your
              answers? You will not be able to change
              them after submission.
            </p>

            {/* Submission Stats */}
            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-emerald-500/10 p-4">
                <div className="text-xs text-slate-400">
                  Answered
                </div>

                <div className="mt-1 text-2xl font-black text-emerald-400">
                  {answeredCount}
                </div>
              </div>

              <div className="rounded-xl bg-white/5 p-4">
                <div className="text-xs text-slate-400">
                  Unanswered
                </div>

                <div className="mt-1 text-2xl font-black">
                  {unansweredCount}
                </div>
              </div>
            </div>

            {unansweredCount > 0 && (
              <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-300">
                You still have{" "}
                <strong>{unansweredCount}</strong>{" "}
                unanswered{" "}
                {unansweredCount === 1
                  ? "question"
                  : "questions"}
                .
              </div>
            )}

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() =>
                  setShowSubmitModal(false)
                }
                className="flex-1 rounded-xl border border-white/10 bg-white/5 px-5 py-3 font-semibold transition hover:bg-white/10"
              >
                Go Back
              </button>

              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 rounded-xl bg-white px-5 py-3 font-bold text-slate-950 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting
                  ? "Submitting..."
                  : "Submit Quiz"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
