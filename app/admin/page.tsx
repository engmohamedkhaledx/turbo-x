"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { supabaseBrowser } from "@/lib/supabase-browser";
import Navbar from "@/components/Navbar";
import StatCard from "@/components/StatCard";
import QuizForm from "@/components/QuizForm";
import Loading from "@/components/Loading";
import EmptyState from "@/components/EmptyState";
import SubmissionReview from "@/components/SubmissionReview";
import type {
  Assignment,
  Profile,
  QuestionDraft,
  Quiz,
  QuizAttemptAnswer,
  QuizAttemptWithDetails,
  SubmissionWithDetails,
} from "@/lib/types";

interface AdminStats {
  totalStudents: number;
  totalQuizzes: number;
  publishedQuizzes: number;
  totalAttempts: number;
  pendingSubmissions: number;
  averageQuizScore: number;
}

function formatSupabaseError(
  queryName: string,
  error: {
    message: string;
    code?: string;
    details?: string;
    hint?: string;
  }
) {
  console.error(`❌ ${queryName} ERROR`, {
    message: error.message,
    code: error.code ?? "unknown",
    details: error.details ?? "none",
    hint: error.hint ?? "none",
  });




  const parts = [`${queryName}: ${error.message}`];

  if (error.code) {
    parts.push(`code ${error.code}`);
  }

  if (error.details) {
    parts.push(error.details);
  }

  if (error.hint) {
    parts.push(`Hint: ${error.hint}`);
  }

  return parts.join(". ");
}

export default function AdminPage() {
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState("");

  const [stats, setStats] = useState<AdminStats>({
    totalStudents: 0,
    totalQuizzes: 0,
    publishedQuizzes: 0,
    totalAttempts: 0,
    pendingSubmissions: 0,
    averageQuizScore: 0,
  });

  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [students, setStudents] = useState<Profile[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [quizAttempts, setQuizAttempts] = useState<QuizAttemptWithDetails[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionWithDetails[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [selectedSubmission, setSelectedSubmission] = useState<SubmissionWithDetails | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [selectedAttempt, setSelectedAttempt] = useState<QuizAttemptWithDetails | null>(null);
  const [selectedAttemptAnswers, setSelectedAttemptAnswers] = useState<QuizAttemptAnswer[]>([]);
  const [attemptAnswersLoading, setAttemptAnswersLoading] = useState(false);
  const [attemptAnswersError, setAttemptAnswersError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [showAssignmentForm, setShowAssignmentForm] = useState(false);
  const [editingQuiz, setEditingQuiz] = useState<Quiz | null>(null);
  const [editingQuizQuestions, setEditingQuizQuestions] = useState<QuestionDraft[]>([]);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);

  const [busyQuizId, setBusyQuizId] = useState<number | null>(null);
  const [busyAssignmentId, setBusyAssignmentId] =
    useState<number | null>(null);

  const [exporting, setExporting] = useState(false);

  const [resultSearch, setResultSearch] = useState("");
  const [resultQuizFilter, setResultQuizFilter] = useState("all");
  const [resultStatusFilter, setResultStatusFilter] = useState("all");

  // Assignment form
  const [assignmentTitle, setAssignmentTitle] = useState("");
  const [assignmentDescription, setAssignmentDescription] =
    useState("");
  const [assignmentDueDate, setAssignmentDueDate] = useState("");
  const [assignmentFile, setAssignmentFile] =
    useState<File | null>(null);
  const [creatingAssignment, setCreatingAssignment] =
    useState(false);

  const loadAdminData = useCallback(async () => {
    const supabase = supabaseBrowser();

    const [
      quizzesRes,
      studentsRes,
      attemptsRes,
      assignmentsRes,
      submissionsRes,
    ] = await Promise.all([
      supabase
        .from("quizzes")
        .select("*")
        .order("created_at", { ascending: false }),

      supabase
        .from("profiles")
        .select("*")
        .eq("role", "student")
        .order("created_at", { ascending: false }),

      supabase
        .from("quiz_attempts")
        .select(
          `*,
          quiz:quizzes!quiz_attempts_quiz_id_fkey(id, title),
          student:profiles!quiz_attempts_student_id_fkey(id, full_name)`
        )
        .order("created_at", { ascending: false }),

      supabase
        .from("assignments")
        .select("*")
        .order("created_at", { ascending: false }),

      supabase
        .from("submissions")
        .select("*")
        .order("created_at", { ascending: false }),
    ]);

    const queryErrors: string[] = [];

    if (quizzesRes.error) {
      queryErrors.push(formatSupabaseError("QUIZZES", quizzesRes.error));
    }

    if (studentsRes.error) {
      queryErrors.push(formatSupabaseError("STUDENTS", studentsRes.error));
    }

    if (attemptsRes.error) {
      queryErrors.push(formatSupabaseError("QUIZ RESULTS", attemptsRes.error));
    }

    if (assignmentsRes.error) {
      queryErrors.push(
        formatSupabaseError("ASSIGNMENTS", assignmentsRes.error)
      );
    }

    if (submissionsRes.error) {
      queryErrors.push(
        formatSupabaseError("SUBMISSIONS", submissionsRes.error)
      );
    }

    let submissionList: SubmissionWithDetails[] = [];

    if (!submissionsRes.error) {
      const relationalSubmissionsRes = await supabase
        .from("submissions")
        .select(
          `*,
          assignment:assignments(id, title, due_date),
          student:profiles!submissions_student_id_fkey(id, full_name)`
        )
        .order("created_at", { ascending: false });

      if (relationalSubmissionsRes.error) {
        queryErrors.push(
          formatSupabaseError(
            "SUBMISSIONS RELATIONSHIP",
            relationalSubmissionsRes.error
          )
        );
      } else {
        submissionList = (relationalSubmissionsRes.data ??
          []) as SubmissionWithDetails[];
      }
    }

    if (queryErrors.length > 0) {
      setError(
        process.env.NODE_ENV === "development"
          ? queryErrors.join(" | ")
          : "Couldn't load admin data right now."
      );
      return;
    }

    const quizList = (quizzesRes.data ?? []) as Quiz[];
    const studentList = (studentsRes.data ?? []) as Profile[];
    const assignmentList = (assignmentsRes.data ?? []) as Assignment[];
    const attemptList = (attemptsRes.data ?? []) as QuizAttemptWithDetails[];

    setQuizzes(quizList);
    setStudents(studentList);
    setAssignments(assignmentList);
    setQuizAttempts(attemptList);
    setSubmissions(submissionList);

    setStats({
      totalStudents: studentList.length,
      totalQuizzes: quizList.length,
      publishedQuizzes: quizList.filter((q) => q.published).length,
      totalAttempts: attemptList.length,
      pendingSubmissions: submissionList.filter((submission) => submission.grade === null).length,
      averageQuizScore:
        attemptList.length > 0
          ? Math.round(
              (attemptList.reduce(
                (total, attempt) => total + Number(attempt.percentage),
                0
              ) /
                attemptList.length) *
                10
            ) / 10
          : 0,
    });
  }, []);

  useEffect(() => {
    let active = true;

    async function load() {
      const supabase = supabaseBrowser();

      const {
        data: userData,
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !userData.user) {
        router.replace("/login");
        return;
      }

      const {
        data: profileData,
        error: profileError,
      } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userData.user.id)
        .single();

      if (profileError || !profileData) {
        router.replace("/login");
        return;
      }

      if (profileData.role !== "admin") {
        router.replace("/dashboard");
        return;
      }

      await loadAdminData();

      if (!active) return;

      setProfile(profileData as Profile);
      setEmail(userData.user.email ?? "");
      setLoading(false);
    }

    load();

    return () => {
      active = false;
    };
  }, [router, loadAdminData]);

  function resetAssignmentForm() {
    setAssignmentTitle("");
    setAssignmentDescription("");
    setAssignmentDueDate("");
    setAssignmentFile(null);
    setEditingAssignment(null);

    const fileInput = document.getElementById(
      "assignment-file"
    ) as HTMLInputElement | null;

    if (fileInput) {
      fileInput.value = "";
    }
  }

  async function openEditQuiz(quiz: Quiz) {
    const supabase = supabaseBrowser();

    const { data: questionsData, error: questionsError } = await supabase
      .from("questions")
      .select("*")
      .eq("quiz_id", quiz.id)
      .order("id", { ascending: true });

    if (questionsError) {
      setError("Couldn't load this quiz for editing.");
      return;
    }

    setEditingQuiz(quiz);
    setEditingQuizQuestions(
      (questionsData ?? []).map((question) => ({
        question_text: question.question_text,
        option_1: question.options?.[0] ?? "",
        option_2: question.options?.[1] ?? "",
        option_3: question.options?.[2] ?? "",
        option_4: question.options?.[3] ?? "",
        correct_answer: question.correct_answer,
        points: Number(question.points) || 1,
      }))
    );
    setShowForm(true);
  }

  function openEditAssignment(assignment: Assignment) {
    setEditingAssignment(assignment);
    setAssignmentTitle(assignment.title);
    setAssignmentDescription(assignment.description ?? "");
    setAssignmentDueDate(
      assignment.due_date
        ? new Date(assignment.due_date).toISOString().slice(0, 16)
        : ""
    );
    setAssignmentFile(null);
    setShowAssignmentForm(true);
  }

  async function togglePublish(quiz: Quiz) {
    setBusyQuizId(quiz.id);

    const supabase = supabaseBrowser();

    const { error: updateError } = await supabase
      .from("quizzes")
      .update({
        published: !quiz.published,
      })
      .eq("id", quiz.id);

    if (updateError) {
      setError(
        `Couldn't update "${quiz.title}". Please try again.`
      );
    } else {
      await loadAdminData();
    }

    setBusyQuizId(null);
  }

  async function openAttemptAnswers(attempt: QuizAttemptWithDetails) {
    setSelectedAttempt(attempt);
    setSelectedAttemptAnswers([]);
    setAttemptAnswersError(null);
    setAttemptAnswersLoading(true);

    try {
      const supabase = supabaseBrowser();
      const { data, error: answersError } = await supabase
        .from("quiz_attempt_answers")
        .select("*")
        .eq("attempt_id", attempt.id)
        .order("question_order", { ascending: true });

      if (answersError) {
        setAttemptAnswersError(
          formatSupabaseError("QUIZ ATTEMPT ANSWERS", answersError)
        );
        return;
      }

      setSelectedAttemptAnswers((data ?? []) as QuizAttemptAnswer[]);
    } catch (error) {
      console.error(error);
      setAttemptAnswersError(
        error instanceof Error
          ? error.message
          : "Couldn't load answers for this quiz attempt."
      );
    } finally {
      setAttemptAnswersLoading(false);
    }
  }

  async function deleteQuiz(quiz: Quiz) {
    if (
      !confirm(
        `Delete "${quiz.title}"? This also removes its questions and attempts.`
      )
    ) {
      return;
    }

    setBusyQuizId(quiz.id);

    const supabase = supabaseBrowser();

    const { error: deleteError } = await supabase
      .from("quizzes")
      .delete()
      .eq("id", quiz.id);

    if (deleteError) {
      setError(
        `Couldn't delete "${quiz.title}". Please try again.`
      );
    } else {
      await loadAdminData();
    }

    setBusyQuizId(null);
  }

  async function saveAssignment() {
    setError(null);

    if (!assignmentTitle.trim()) {
      setError("Please enter an assignment title.");
      return;
    }

    if (!assignmentFile && !editingAssignment) {
      setError("Please choose an assignment file.");
      return;
    }

    setCreatingAssignment(true);

    try {
      const supabase = supabaseBrowser();
      let finalFilePath = editingAssignment?.file_path ?? null;
      let uploadedNewFile = false;

      if (assignmentFile) {
        const fileExtension =
          assignmentFile.name.includes(".")
            ? assignmentFile.name.split(".").pop()
            : "";

        const safeExtension = fileExtension
          ? `.${fileExtension}`
          : "";

        const newFilePath = `assignment-files/${crypto.randomUUID()}${safeExtension}`;

        if (editingAssignment?.file_path) {
          const { error: removeError } = await supabase.storage
            .from("assignments")
            .remove([editingAssignment.file_path]);

          if (removeError) {
            console.error(removeError);
          }
        }

        const { error: uploadError } = await supabase.storage
          .from("assignments")
          .upload(newFilePath, assignmentFile, {
            cacheControl: "3600",
            upsert: false,
          });

        if (uploadError) {
          console.error(uploadError);
          setError(
            `Couldn't upload the file: ${uploadError.message}`
          );
          return;
        }

        finalFilePath = newFilePath;
        uploadedNewFile = true;
      }

      const payload = {
        title: assignmentTitle.trim(),
        description: assignmentDescription.trim() || null,
        file_path: finalFilePath,
        due_date: assignmentDueDate
          ? new Date(assignmentDueDate).toISOString()
          : null,
      };

      let assignmentError;

      if (editingAssignment) {
        const result = await supabase
          .from("assignments")
          .update(payload)
          .eq("id", editingAssignment.id)
          .select()
          .single();

        assignmentError = result.error;
      } else {
        const result = await supabase
          .from("assignments")
          .insert(payload)
          .select()
          .single();

        assignmentError = result.error;
      }

      if (assignmentError) {
        console.error(assignmentError);

        if (uploadedNewFile && finalFilePath) {
          await supabase.storage
            .from("assignments")
            .remove([finalFilePath]);
        }

        setError(
          editingAssignment
            ? `Couldn't update the assignment: ${assignmentError.message}`
            : `Couldn't create the assignment: ${assignmentError.message}`
        );

        return;
      }

      resetAssignmentForm();
      setShowAssignmentForm(false);
      setSuccessMessage(
        editingAssignment
          ? "Assignment updated successfully."
          : "Assignment created successfully."
      );
      await loadAdminData();
    } catch (error) {
      console.error(error);

      setError(
        editingAssignment
          ? "Something went wrong while updating the assignment."
          : "Something went wrong while creating the assignment."
      );
    } finally {
      setCreatingAssignment(false);
    }
  }

  async function deleteAssignment(
    assignment: Assignment
  ) {
    if (
      !confirm(
        `Delete "${assignment.title}"? This will remove the assignment from the platform.`
      )
    ) {
      return;
    }

    setBusyAssignmentId(assignment.id);
    setError(null);

    try {
      const supabase = supabaseBrowser();

      if (assignment.file_path) {
        const { error: storageError } =
          await supabase.storage
            .from("assignments")
            .remove([assignment.file_path]);

        if (storageError) {
          console.error(storageError);
        }
      }

      const { error: deleteError } = await supabase
        .from("assignments")
        .delete()
        .eq("id", assignment.id);

      if (deleteError) {
        console.error(deleteError);

        setError(
          `Couldn't delete "${assignment.title}". Please try again.`
        );

        return;
      }

      await loadAdminData();
    } finally {
      setBusyAssignmentId(null);
    }
  }

  async function handleGradeSave(
    submissionId: number,
    grade: number,
    feedback: string | null
  ) {
    const supabase = supabaseBrowser();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      throw new Error("Your session has expired. Please sign in again.");
    }

    if (!Number.isFinite(grade) || grade < 0) {
      throw new Error("Grade must be a non-negative number.");
    }

    const { error } = await supabase
      .from("submissions")
      .update({
        grade,
        feedback,
        graded_at: new Date().toISOString(),
        graded_by: userData.user.id,
      })
      .eq("id", submissionId);

    if (error) {
      throw new Error(error.message || "Couldn't save the grade.");
    }

    setSubmissions((current) =>
      current.map((submission) =>
        submission.id === submissionId
          ? {
              ...submission,
              grade,
              feedback,
              graded_at: new Date().toISOString(),
              graded_by: userData.user.id,
            }
          : submission
      )
    );

    setSuccessMessage("Submission graded successfully.");
    setError(null);
    await loadAdminData();
  }

  const filteredQuizAttempts = useMemo(() => {
    const normalizedSearch = resultSearch.trim().toLowerCase();

    return quizAttempts.filter((attempt) => {
      const studentName = attempt.student?.full_name ?? "Unknown student";
      const percentage = Number(attempt.percentage);
      const status = percentage >= 85
        ? "strong"
        : percentage >= 60
        ? "passing"
        : "warning";

      const matchesSearch =
        normalizedSearch.length === 0 ||
        studentName.toLowerCase().includes(normalizedSearch) ||
        (attempt.quiz?.title ?? "").toLowerCase().includes(normalizedSearch);
      const matchesQuiz =
        resultQuizFilter === "all" || String(attempt.quiz_id) === resultQuizFilter;
      const matchesStatus =
        resultStatusFilter === "all" || status === resultStatusFilter;

      return matchesSearch && matchesQuiz && matchesStatus;
    });
  }, [quizAttempts, resultQuizFilter, resultSearch, resultStatusFilter]);

  function getResultStatus(percentage: number) {
    if (percentage >= 85) {
      return {
        label: "Strong",
        className: "border border-emerald-700/40 bg-emerald-900/20 text-emerald-300",
      };
    }

    if (percentage >= 60) {
      return {
        label: "Passing",
        className: "border border-sky-700/40 bg-sky-900/20 text-sky-300",
      };
    }

    return {
      label: "Needs Review",
      className: "border border-amber-700/40 bg-amber-900/20 text-amber-300",
    };
  }

  function exportQuizResults() {
    if (quizAttempts.length === 0) {
      return;
    }

    setExporting(true);

    try {
      const rows = quizAttempts.map((attempt) => ({
        Student: attempt.student?.full_name ?? "Unknown student",
        Quiz: attempt.quiz?.title ?? `Quiz #${attempt.quiz_id}`,
        Score: attempt.score,
        "Total Points": attempt.total_points,
        Percentage: `${attempt.percentage}%`,
        "Attempt Date": new Date(attempt.created_at).toLocaleString(),
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();

      XLSX.utils.book_append_sheet(workbook, worksheet, "Quiz Results");
      XLSX.writeFile(workbook, "TurboX-Quiz-Results.xlsx");
    } finally {
      setExporting(false);
    }
  }

  function exportStudents() {
    setExporting(true);

    try {
      const rows = students.map((s, i) => ({
        "#": i + 1,
        "Student ID": s.id,
        Name: s.full_name ?? "—",
        Role: s.role,
        "Created At": new Date(s.created_at).toLocaleString(),
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();

      XLSX.utils.book_append_sheet(workbook, worksheet, "Students");
      XLSX.writeFile(workbook, "TurboX-Students.xlsx");
    } finally {
      setExporting(false);
    }
  }

  if (loading || !profile) {
    return <Loading label="Loading admin dashboard" />;
  }

  return (
    <div className="min-h-screen bg-ink">
      <Navbar
        role="admin"
        name={profile.full_name ?? "Admin"}
        email={email}
      />

      <main className="mx-auto max-w-6xl px-6 py-10 sm:px-8">
        {/* HEADER */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-2xl font-semibold text-white">
              Admin overview
            </h1>

            <p className="mt-1 text-sm text-neutral-500">
              Manage quizzes, assignments, publishing,
              and your student roster.
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <Link
              href="/quizzes"
              className="focus-ring rounded-lg border border-neutral-800 px-4 py-2.5 text-sm text-neutral-300 hover:border-crimson/50 hover:text-white"
            >
              Student View
            </Link>

            <button
              onClick={() => setShowForm((v) => !v)}
              className="focus-ring rounded-lg bg-crimson px-4 py-2.5 text-sm font-medium text-white hover:bg-crimson-bright"
            >
              {showForm
                ? "Close form"
                : "+ Create Quiz"}
            </button>

            <button
              onClick={() =>
                setShowAssignmentForm(
                  (v) => !v
                )
              }
              className="focus-ring rounded-lg border border-crimson/40 bg-crimson/10 px-4 py-2.5 text-sm font-medium text-crimson-bright hover:bg-crimson/20"
            >
              {showAssignmentForm
                ? "Close Assignment"
                : "+ Create Assignment"}
            </button>

            <button
              onClick={exportStudents}
              disabled={
                exporting ||
                students.length === 0
              }
              className="focus-ring rounded-lg border border-neutral-800 px-4 py-2.5 text-sm text-neutral-300 hover:border-crimson/50 hover:text-white disabled:opacity-50"
            >
              {exporting
                ? "Exporting…"
                : "Export Students Excel"}
            </button>

            <button
              onClick={exportQuizResults}
              disabled={exporting || quizAttempts.length === 0}
              className="focus-ring rounded-lg border border-neutral-800 px-4 py-2.5 text-sm text-neutral-300 hover:border-crimson/50 hover:text-white disabled:opacity-50"
            >
              {exporting ? "Exporting…" : "Export Quiz Results"}
            </button>
          </div>
        </div>

        {/* ERROR */}
        {error && (
          <div className="mb-6 flex items-center justify-between gap-4 rounded-lg border border-crimson/40 bg-crimson/10 px-4 py-3 text-sm text-crimson-bright">
            <span>{error}</span>

            <button
              type="button"
              onClick={() => setError(null)}
              className="text-xs text-neutral-400 hover:text-white"
            >
              Dismiss
            </button>
          </div>
        )}

        {successMessage && (
          <div className="mb-6 flex items-center justify-between gap-4 rounded-lg border border-emerald-700/40 bg-emerald-900/20 px-4 py-3 text-sm text-emerald-300">
            <span>{successMessage}</span>

            <button
              type="button"
              onClick={() => setSuccessMessage(null)}
              className="text-xs text-neutral-400 hover:text-white"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* STATS */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard
            label="Total Students"
            value={stats.totalStudents}
          />

          <StatCard
            label="Total Quizzes"
            value={stats.totalQuizzes}
          />

          <StatCard
            label="Published Quizzes"
            value={stats.publishedQuizzes}
          />

          <StatCard
            label="Total Attempts"
            value={stats.totalAttempts}
          />

          <StatCard
            label="Pending Submissions"
            value={stats.pendingSubmissions}
          />

          <StatCard
            label="Average Quiz Score"
            value={stats.averageQuizScore}
            suffix="%"
          />
        </div>

        {/* QUIZ FORM */}
        {showForm && (
          <div className="mt-8">
            <QuizForm
              initialQuiz={editingQuiz}
              initialQuestions={editingQuizQuestions}
              onCreated={() => {
                setShowForm(false);
                setEditingQuiz(null);
                setEditingQuizQuestions([]);
                loadAdminData();
              }}
              onCancel={() => {
                setShowForm(false);
                setEditingQuiz(null);
                setEditingQuizQuestions([]);
              }}
            />
          </div>
        )}

        {/* ASSIGNMENT FORM */}
        {showAssignmentForm && (
          <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-xl">
            <div className="mb-6">
              <h2 className="font-display text-xl font-semibold text-white">
                {editingAssignment ? "Edit Assignment" : "Create Assignment"}
              </h2>

              <p className="mt-1 text-sm text-neutral-500">
                {editingAssignment
                  ? "Update the assignment details and file."
                  : "Upload an assignment file for your students."}
              </p>
            </div>

            <div className="grid gap-5">
              {/* TITLE */}
              <div>
                <label
                  htmlFor="assignment-title"
                  className="mb-2 block text-sm font-medium text-neutral-300"
                >
                  Assignment Title
                </label>

                <input
                  id="assignment-title"
                  type="text"
                  value={assignmentTitle}
                  onChange={(e) =>
                    setAssignmentTitle(
                      e.target.value
                    )
                  }
                  placeholder="C++ OOP Assignment #1"
                  className="focus-ring w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-600"
                />
              </div>

              {/* DESCRIPTION */}
              <div>
                <label
                  htmlFor="assignment-description"
                  className="mb-2 block text-sm font-medium text-neutral-300"
                >
                  Description
                </label>

                <textarea
                  id="assignment-description"
                  value={assignmentDescription}
                  onChange={(e) =>
                    setAssignmentDescription(
                      e.target.value
                    )
                  }
                  placeholder="Describe what students need to do..."
                  rows={4}
                  className="focus-ring w-full resize-none rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-600"
                />
              </div>

              {/* DUE DATE */}
              <div>
                <label
                  htmlFor="assignment-due-date"
                  className="mb-2 block text-sm font-medium text-neutral-300"
                >
                  Due Date
                </label>

                <input
                  id="assignment-due-date"
                  type="datetime-local"
                  value={assignmentDueDate}
                  onChange={(e) =>
                    setAssignmentDueDate(
                      e.target.value
                    )
                  }
                  className="focus-ring w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-white outline-none"
                />
              </div>

              {/* FILE */}
              <div>
                <label
                  htmlFor="assignment-file"
                  className="mb-2 block text-sm font-medium text-neutral-300"
                >
                  Assignment File
                </label>

                <div className="rounded-xl border border-dashed border-neutral-700 bg-neutral-950 p-5">
                  <input
                    id="assignment-file"
                    type="file"
                    onChange={(e) =>
                      setAssignmentFile(
                        e.target.files?.[0] ??
                          null
                      )
                    }
                    className="block w-full text-sm text-neutral-400 file:mr-4 file:rounded-lg file:border-0 file:bg-white file:px-4 file:py-2 file:font-medium file:text-neutral-950 hover:file:bg-neutral-200"
                  />

                  {assignmentFile && (
                    <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-400">
                      Selected:{" "}
                      {assignmentFile.name}
                    </div>
                  )}
                </div>

                <p className="mt-2 text-xs text-neutral-600">
                  The file will be stored securely in
                  Supabase Storage.
                </p>
              </div>

              {/* ACTIONS */}
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowAssignmentForm(false);
                    resetAssignmentForm();
                  }}
                  disabled={
                    creatingAssignment
                  }
                  className="focus-ring rounded-xl border border-neutral-800 px-5 py-3 text-sm font-medium text-neutral-300 hover:border-neutral-600 hover:text-white disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={saveAssignment}
                  disabled={
                    creatingAssignment
                  }
                  className="focus-ring rounded-xl bg-crimson px-6 py-3 text-sm font-semibold text-white hover:bg-crimson-bright disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {creatingAssignment
                    ? editingAssignment
                      ? "Saving..."
                      : "Uploading..."
                    : editingAssignment
                      ? "Save Changes"
                      : "Create Assignment"}
                </button>
              </div>
            </div>
          </section>
        )}

        {/* QUIZZES */}
        <section className="mt-10">
          <h2 className="mb-4 font-display text-lg font-semibold text-white">
            Quizzes
          </h2>

          {quizzes.length === 0 ? (
            <EmptyState
              title="No quizzes yet."
              description="Create your first quiz to get started."
            />
          ) : (
            <div className="panel overflow-hidden rounded-2xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-neutral-800 text-xs uppercase tracking-wider text-neutral-500">
                      <th className="px-5 py-3.5 font-medium">
                        Title
                      </th>

                      <th className="px-5 py-3.5 font-medium">
                        Status
                      </th>

                      <th className="px-5 py-3.5 font-medium">
                        Created
                      </th>

                      <th className="px-5 py-3.5 text-right font-medium">
                        Actions
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {quizzes.map((quiz) => (
                      <tr
                        key={quiz.id}
                        className="border-b border-neutral-900 last:border-0"
                      >
                        <td className="px-5 py-4 text-white">
                          {quiz.title}
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs ${
                              quiz.published
                                ? "border border-emerald-700/40 bg-emerald-900/20 text-emerald-400"
                                : "border border-neutral-700 bg-neutral-900 text-neutral-400"
                            }`}
                          >
                            {quiz.published
                              ? "Published"
                              : "Draft"}
                          </span>
                        </td>

                        <td className="px-5 py-4 text-neutral-500">
                          {new Date(
                            quiz.created_at
                          ).toLocaleDateString()}
                        </td>

                        <td className="px-5 py-4">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() =>
                                togglePublish(
                                  quiz
                                )
                              }
                              disabled={
                                busyQuizId ===
                                quiz.id
                              }
                              className="focus-ring rounded-md border border-neutral-800 px-2.5 py-1.5 text-xs text-neutral-300 hover:border-crimson/50 hover:text-white disabled:opacity-50"
                            >
                              {quiz.published
                                ? "Unpublish"
                                : "Publish"}
                            </button>

                            <button
                              onClick={() =>
                                openEditQuiz(quiz)
                              }
                              className="focus-ring rounded-md border border-neutral-800 px-2.5 py-1.5 text-xs text-neutral-300 hover:border-crimson/50 hover:text-white"
                            >
                              Edit
                            </button>

                            <button
                              onClick={() =>
                                deleteQuiz(
                                  quiz
                                )
                              }
                              disabled={
                                busyQuizId ===
                                quiz.id
                              }
                              className="focus-ring rounded-md border border-neutral-800 px-2.5 py-1.5 text-xs text-neutral-400 hover:border-crimson/60 hover:text-crimson-bright disabled:opacity-50"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* QUIZ RESULTS */}
        <section className="mt-10">
          <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="font-display text-lg font-semibold text-white">
                Quiz Results
              </h2>

              <p className="mt-1 text-sm text-neutral-500">
                Review student quiz and exam attempts.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <label className="sr-only" htmlFor="result-search">
                Search quiz results
              </label>
              <input
                id="result-search"
                type="search"
                value={resultSearch}
                onChange={(event) => setResultSearch(event.target.value)}
                placeholder="Search student or quiz"
                className="focus-ring rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-white outline-none placeholder:text-neutral-600"
              />

              <label className="sr-only" htmlFor="result-quiz-filter">
                Filter quiz results by quiz
              </label>
              <select
                id="result-quiz-filter"
                value={resultQuizFilter}
                onChange={(event) => setResultQuizFilter(event.target.value)}
                className="focus-ring rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-300 outline-none"
              >
                <option value="all">All quizzes</option>
                {quizzes.map((quiz) => (
                  <option key={quiz.id} value={quiz.id}>
                    {quiz.title}
                  </option>
                ))}
              </select>

              <label className="sr-only" htmlFor="result-status-filter">
                Filter quiz results by status
              </label>
              <select
                id="result-status-filter"
                value={resultStatusFilter}
                onChange={(event) => setResultStatusFilter(event.target.value)}
                className="focus-ring rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-300 outline-none"
              >
                <option value="all">All statuses</option>
                <option value="strong">Strong</option>
                <option value="passing">Passing</option>
                <option value="warning">Needs Review</option>
              </select>
            </div>
          </div>

          {quizAttempts.length === 0 ? (
            <EmptyState
              title="No quiz results yet."
              description="Student quiz attempts will appear here after submission."
            />
          ) : filteredQuizAttempts.length === 0 ? (
            <EmptyState
              title="No matching results."
              description="Try adjusting the search or filters."
            />
          ) : (
            <div className="panel overflow-hidden rounded-2xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-neutral-800 text-xs uppercase tracking-wider text-neutral-500">
                      <th className="px-5 py-3.5 font-medium">Student</th>
                      <th className="px-5 py-3.5 font-medium">Quiz</th>
                      <th className="px-5 py-3.5 font-medium">Score</th>
                      <th className="px-5 py-3.5 font-medium">Total</th>
                      <th className="px-5 py-3.5 font-medium">Percentage</th>
                      <th className="px-5 py-3.5 font-medium">Submitted</th>
                      <th className="px-5 py-3.5 text-right font-medium">Action</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredQuizAttempts.map((attempt) => {
                      const percentage = Number(attempt.percentage);
                      const status = getResultStatus(percentage);

                      return (
                        <tr
                          key={attempt.id}
                          className="border-b border-neutral-900 last:border-0"
                        >
                          <td className="px-5 py-4 text-white">
                            {attempt.student?.full_name ?? "Unknown student"}
                          </td>
                          <td className="px-5 py-4 text-neutral-300">
                            {attempt.quiz?.title ?? `Quiz #${attempt.quiz_id}`}
                          </td>
                          <td className="px-5 py-4 text-neutral-300">
                            {attempt.score}
                          </td>
                          <td className="px-5 py-4 text-neutral-300">
                            {attempt.total_points}
                          </td>
                          <td className="px-5 py-4">
                            <span className={`rounded-full px-2.5 py-1 text-xs ${status.className}`}>
                              {percentage}%
                            </span>
                          </td>
                          <td className="px-5 py-4 text-neutral-500">
                            {new Date(attempt.created_at).toLocaleString()}
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex justify-end">
                              <button
                                type="button"
                                onClick={() => void openAttemptAnswers(attempt)}
                                className="rounded-md border border-neutral-800 px-2.5 py-1.5 text-xs text-neutral-300 hover:border-crimson/50 hover:text-white"
                              >
                                View Answers
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* ASSIGNMENTS */}
        <section className="mt-10">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-lg font-semibold text-white">
                Assignments
              </h2>

              <p className="mt-1 text-sm text-neutral-500">
                Manage files and deadlines for students.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                resetAssignmentForm();
                setShowAssignmentForm(true);
              }}
              className="focus-ring rounded-lg border border-neutral-800 px-3 py-2 text-xs text-neutral-300 hover:border-crimson/50 hover:text-white"
            >
              + New Assignment
            </button>
          </div>

          {assignments.length === 0 ? (
            <EmptyState
              title="No assignments yet."
              description="Create your first assignment and upload its file."
            />
          ) : (
            <div className="panel overflow-hidden rounded-2xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-neutral-800 text-xs uppercase tracking-wider text-neutral-500">
                      <th className="px-5 py-3.5 font-medium">
                        Assignment
                      </th>

                      <th className="px-5 py-3.5 font-medium">
                        File
                      </th>

                      <th className="px-5 py-3.5 font-medium">
                        Due Date
                      </th>

                      <th className="px-5 py-3.5 font-medium">
                        Created
                      </th>

                      <th className="px-5 py-3.5 text-right font-medium">
                        Actions
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {assignments.map(
                      (assignment) => (
                        <tr
                          key={assignment.id}
                          className="border-b border-neutral-900 last:border-0"
                        >
                          <td className="px-5 py-4">
                            <div className="font-medium text-white">
                              {assignment.title}
                            </div>

                            {assignment.description && (
                              <div className="mt-1 max-w-md truncate text-xs text-neutral-500">
                                {
                                  assignment.description
                                }
                              </div>
                            )}
                          </td>

                          <td className="px-5 py-4">
                            <span className="rounded-full border border-neutral-800 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-400">
                              {assignment.file_path
                                ? "Uploaded"
                                : "No File"}
                            </span>
                          </td>

                          <td className="px-5 py-4 text-neutral-500">
                            {assignment.due_date
                              ? new Date(
                                  assignment.due_date
                                ).toLocaleString()
                              : "No deadline"}
                          </td>

                          <td className="px-5 py-4 text-neutral-500">
                            {new Date(
                              assignment.created_at
                            ).toLocaleDateString()}
                          </td>

                          <td className="px-5 py-4">
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  openEditAssignment(
                                    assignment
                                  )
                                }
                                className="focus-ring rounded-md border border-neutral-800 px-2.5 py-1.5 text-xs text-neutral-300 hover:border-crimson/50 hover:text-white"
                              >
                                Edit
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  deleteAssignment(
                                    assignment
                                  )
                                }
                                disabled={
                                  busyAssignmentId ===
                                  assignment.id
                                }
                                className="focus-ring rounded-md border border-neutral-800 px-2.5 py-1.5 text-xs text-neutral-400 hover:border-crimson/60 hover:text-crimson-bright disabled:opacity-50"
                              >
                                {busyAssignmentId ===
                                assignment.id
                                  ? "Deleting..."
                                  : "Delete"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* ASSIGNMENT SUBMISSIONS */}
        <section className="mt-10">
          <h2 className="mb-4 font-display text-lg font-semibold text-white">
            Assignment Submissions
          </h2>

          {submissions.length === 0 ? (
            <EmptyState
              title="No submissions yet."
              description="Student assignment uploads will appear here for review."
            />
          ) : (
            <div className="panel overflow-hidden rounded-2xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-neutral-800 text-xs uppercase tracking-wider text-neutral-500">
                      <th className="px-5 py-3.5 font-medium">Student</th>
                      <th className="px-5 py-3.5 font-medium">Assignment</th>
                      <th className="px-5 py-3.5 font-medium">Submitted</th>
                      <th className="px-5 py-3.5 font-medium">Status</th>
                      <th className="px-5 py-3.5 font-medium">Grade</th>
                      <th className="px-5 py-3.5 text-right font-medium">Action</th>
                    </tr>
                  </thead>

                  <tbody>
                    {submissions.map((submission) => (
                      <tr
                        key={submission.id}
                        className="border-b border-neutral-900 last:border-0"
                      >
                        <td className="px-5 py-4 text-white">
                          {submission.student?.full_name ?? "Unknown student"}
                        </td>
                        <td className="px-5 py-4 text-neutral-300">
                          {submission.assignment?.title ?? `Assignment #${submission.assignment_id}`}
                        </td>
                        <td className="px-5 py-4 text-neutral-500">
                          {new Date(submission.created_at).toLocaleString()}
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs ${
                              submission.grade === null
                                ? "border border-amber-700/40 bg-amber-900/20 text-amber-300"
                                : "border border-emerald-700/40 bg-emerald-900/20 text-emerald-300"
                            }`}
                          >
                            {submission.grade === null ? "Pending Review" : "Graded"}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-neutral-300">
                          {submission.grade === null ? "—" : submission.grade}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedSubmission(submission);
                                setReviewOpen(true);
                              }}
                              className="rounded-md border border-neutral-800 px-2.5 py-1.5 text-xs text-neutral-300 hover:border-crimson/50 hover:text-white"
                            >
                              Review
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* STUDENTS */}
        <section className="mt-10">
          <h2 className="mb-4 font-display text-lg font-semibold text-white">
            Students
          </h2>

          {students.length === 0 ? (
            <EmptyState title="No students yet." />
          ) : (
            <div className="panel overflow-hidden rounded-2xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-neutral-800 text-xs uppercase tracking-wider text-neutral-500">
                      <th className="px-5 py-3.5 font-medium">
                        #
                      </th>

                      <th className="px-5 py-3.5 font-medium">
                        Name
                      </th>

                      <th className="px-5 py-3.5 font-medium">
                        Student ID
                      </th>

                      <th className="px-5 py-3.5 font-medium">
                        Role
                      </th>

                      <th className="px-5 py-3.5 font-medium">
                        Created At
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {students.map((s, i) => (
                      <tr
                        key={s.id}
                        className="border-b border-neutral-900 last:border-0"
                      >
                        <td className="px-5 py-4 text-neutral-500">
                          {i + 1}
                        </td>

                        <td className="px-5 py-4 text-white">
                          {s.full_name ?? "—"}
                        </td>

                        <td className="px-5 py-4 text-neutral-500">
                          {s.id}
                        </td>

                        <td className="px-5 py-4 capitalize text-neutral-400">
                          {s.role}
                        </td>

                        <td className="px-5 py-4 text-neutral-500">
                          {new Date(
                            s.created_at
                          ).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </main>

      {selectedAttempt && (
        <div className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-black/70 px-4 py-6 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="quiz-result-title"
            className="my-auto max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl sm:p-8"
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">
                  Quiz attempt answers
                </p>
                <h2
                  id="quiz-result-title"
                  className="mt-2 font-display text-2xl font-semibold text-white"
                >
                  {selectedAttempt.quiz?.title ?? `Quiz #${selectedAttempt.quiz_id}`}
                </h2>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSelectedAttempt(null);
                  setSelectedAttemptAnswers([]);
                  setAttemptAnswersError(null);
                }}
                className="rounded-lg border border-neutral-800 px-3 py-1.5 text-sm text-neutral-300 hover:border-neutral-600 hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4">
                <p className="text-xs uppercase tracking-wider text-neutral-500">
                  Student
                </p>
                <p className="mt-2 text-sm font-medium text-white">
                  {selectedAttempt.student?.full_name ?? "Unknown student"}
                </p>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4">
                <p className="text-xs uppercase tracking-wider text-neutral-500">
                  Attempt Date
                </p>
                <p className="mt-2 text-sm font-medium text-white">
                  {new Date(selectedAttempt.created_at).toLocaleString()}
                </p>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4">
                <p className="text-xs uppercase tracking-wider text-neutral-500">
                  Score
                </p>
                <p className="mt-2 text-2xl font-black text-white">
                  {selectedAttempt.score}
                </p>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4">
                <p className="text-xs uppercase tracking-wider text-neutral-500">
                  Total Points
                </p>
                <p className="mt-2 text-2xl font-black text-white">
                  {selectedAttempt.total_points}
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-crimson/20 bg-crimson/10 p-5">
              <p className="text-xs uppercase tracking-wider text-neutral-500">
                Percentage
              </p>
              <div className="mt-2 flex items-center justify-between gap-4">
                <p className="text-3xl font-black text-white">
                  {selectedAttempt.percentage}%
                </p>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs ${getResultStatus(Number(selectedAttempt.percentage)).className}`}
                >
                  {getResultStatus(Number(selectedAttempt.percentage)).label}
                </span>
              </div>
            </div>

            <section className="mt-7">
              <h3 className="mb-4 font-display text-lg font-semibold text-white">
                Question answers
              </h3>

              {attemptAnswersLoading ? (
                <p className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4 text-sm text-neutral-400">
                  Loading saved answers…
                </p>
              ) : attemptAnswersError ? (
                <p className="rounded-xl border border-crimson/40 bg-crimson/10 p-4 text-sm text-crimson-bright">
                  {attemptAnswersError}
                </p>
              ) : selectedAttemptAnswers.length === 0 ? (
                <p className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4 text-sm text-neutral-400">
                  No saved answer details are available for this attempt. Attempts submitted before answer tracking was enabled cannot be reconstructed.
                </p>
              ) : (
                <div className="space-y-4">
                  {selectedAttemptAnswers.map((answer) => (
                    <article
                      key={answer.id}
                      className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4 sm:p-5"
                    >
                      <h4 className="font-semibold text-white">
                        Question {answer.question_order}
                      </h4>
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-neutral-300">
                        {answer.question_text}
                      </p>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="min-w-0 rounded-xl border border-neutral-800 bg-black/20 p-3">
                          <p className="text-xs uppercase tracking-wider text-neutral-500">
                            Student Answer
                          </p>
                          <p className="mt-2 whitespace-pre-wrap break-words text-sm text-neutral-200">
                            {answer.student_answer ?? "Unanswered"}
                          </p>
                        </div>
                        <div className="min-w-0 rounded-xl border border-neutral-800 bg-black/20 p-3">
                          <p className="text-xs uppercase tracking-wider text-neutral-500">
                            Correct Answer
                          </p>
                          <p className="mt-2 whitespace-pre-wrap break-words text-sm text-neutral-200">
                            {answer.correct_answer}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
                        <p className="text-neutral-300">
                          Points: {answer.points_earned} / {answer.possible_points}
                        </p>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            answer.is_correct
                              ? "bg-emerald-500/15 text-emerald-300"
                              : "bg-red-500/15 text-red-300"
                          }`}
                        >
                          {answer.is_correct ? "✓ Correct" : "✗ Incorrect"}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      <SubmissionReview
        submission={selectedSubmission}
        open={reviewOpen}
        onClose={() => {
          setReviewOpen(false);
          setSelectedSubmission(null);
        }}
        onSave={handleGradeSave}
      />
    </div>
  );
}
