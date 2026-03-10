"use client"

import { useCallback, useMemo, useRef, useState } from "react"

import {
  analyzeBrandBlueprintInterviewAction,
  approveBrandBlueprintAction,
  saveManualBrandBlueprintAction,
} from "@/features/brand-blueprint/actions"
import { BRAND_BLUEPRINT_INTERVIEW_QUESTIONS } from "@/features/brand-blueprint/constants"
import { transcribeAudioBlob } from "@/features/brain-dump/service"
import { formatActionErrorMessage } from "@/lib/server-actions/contracts"
import type { BrandBlueprint, PersistedBrandBlueprint } from "@/lib/types/domain"

import type { BrandBlueprintPath } from "../types"

type InterviewStage =
  | "idle"
  | "listening"
  | "transcribing"
  | "analyzing"
  | "ready"
  | "error"

function stopStream(stream: MediaStream | null) {
  if (!stream) {
    return
  }
  for (const track of stream.getTracks()) {
    track.stop()
  }
}

function createDefaultBlueprint(): BrandBlueprint {
  return {
    niche: "",
    audience: "",
    brandTone: "",
    personalityTraits: ["", "", ""],
    contentPillars: [
      { title: "", description: "" },
      { title: "", description: "" },
      { title: "", description: "" },
    ],
    elevatorPitch: "",
    bioShort: "",
  }
}

export function useBrandBlueprintStudio(initialBlueprint: PersistedBrandBlueprint | null) {
  const [selectedPath, setSelectedPath] = useState<BrandBlueprintPath | null>(
    initialBlueprint?.onboardingPath ?? null
  )
  const [questionIndex, setQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState<string[]>(["", "", ""])
  const [stage, setStage] = useState<InterviewStage>("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [activeBlueprint, setActiveBlueprint] = useState<PersistedBrandBlueprint | null>(
    initialBlueprint
  )
  const [manualBlueprint, setManualBlueprint] = useState<BrandBlueprint>(
    initialBlueprint?.blueprint ?? createDefaultBlueprint()
  )
  const [isEditingManual, setIsEditingManual] = useState(false)
  const [isApproving, setIsApproving] = useState(false)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const isRecording = stage === "listening"
  const currentQuestion = BRAND_BLUEPRINT_INTERVIEW_QUESTIONS[questionIndex]

  const canAnalyze = useMemo(
    () => selectedPath !== null && answers.every((answer) => answer.trim().length > 0),
    [answers, selectedPath]
  )

  const interviewTranscript = useMemo(
    () =>
      answers
        .map((answer, index) => {
          const prompt = BRAND_BLUEPRINT_INTERVIEW_QUESTIONS[index]?.prompt ?? `Spørgsmål ${index + 1}`
          return `${prompt}\n${answer.trim()}`
        })
        .join("\n\n"),
    [answers]
  )

  const startRecording = useCallback(async () => {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setStage("error")
      setErrorMessage("Din browser understøtter ikke lydoptagelse.")
      return
    }

    try {
      setErrorMessage(null)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const recorder = new MediaRecorder(stream)
      recorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      recorder.onstop = () => {
        void (async () => {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" })
          stopStream(streamRef.current)
          streamRef.current = null

          if (blob.size === 0) {
            setStage("error")
            setErrorMessage("Optagelsen var tom. Prøv igen.")
            return
          }

          try {
            setStage("transcribing")
            const transcript = await transcribeAudioBlob(blob)
            setAnswers((previous) => {
              const next = [...previous]
              next[questionIndex] = transcript
              return next
            })
            setStage("ready")
          } catch (error: unknown) {
            setStage("error")
            setErrorMessage(
              error instanceof Error ? error.message : "Transskription fejlede. Prøv igen."
            )
          }
        })()
      }

      recorder.start()
      setStage("listening")
    } catch {
      setStage("error")
      setErrorMessage("Kunne ikke starte optagelse. Tjek mikrofontilladelser.")
    }
  }, [questionIndex])

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop()
    }
  }, [])

  const goToNextQuestion = useCallback(() => {
    if (questionIndex < BRAND_BLUEPRINT_INTERVIEW_QUESTIONS.length - 1) {
      setQuestionIndex((previous) => previous + 1)
      setErrorMessage(null)
      setStage("idle")
    }
  }, [questionIndex])

  const goToPreviousQuestion = useCallback(() => {
    if (questionIndex > 0) {
      setQuestionIndex((previous) => previous - 1)
      setErrorMessage(null)
      setStage("idle")
    }
  }, [questionIndex])

  const runAnalysis = useCallback(async () => {
    if (!selectedPath) {
      setErrorMessage("Vælg retning før analyse.")
      return
    }

    if (!canAnalyze) {
      setErrorMessage("Besvar alle 3 spørgsmål før analyse.")
      return
    }

    setStage("analyzing")
    setErrorMessage(null)

    const result = await analyzeBrandBlueprintInterviewAction({
      path: selectedPath,
      answers,
      interviewTranscript,
    })

    if (!result.success) {
      setStage("error")
      setErrorMessage(formatActionErrorMessage(result))
      return
    }

    setActiveBlueprint(result.blueprint)
    setManualBlueprint(result.blueprint.blueprint)
    setIsEditingManual(false)
    setStage("ready")
  }, [answers, canAnalyze, interviewTranscript, selectedPath])

  const approveBlueprint = useCallback(async () => {
    if (!activeBlueprint) {
      setErrorMessage("Ingen blueprint klar til godkendelse.")
      return
    }

    setIsApproving(true)
    setErrorMessage(null)
    const result = await approveBrandBlueprintAction({
      blueprintId: activeBlueprint.id,
    })
    setIsApproving(false)

    if (!result.success) {
      setErrorMessage(formatActionErrorMessage(result))
      return
    }

    setActiveBlueprint(result.blueprint)
    setManualBlueprint(result.blueprint.blueprint)
  }, [activeBlueprint])

  const saveManualBlueprint = useCallback(async () => {
    setErrorMessage(null)

    const cleanedTraits = manualBlueprint.personalityTraits
      .map((trait) => trait.trim())
      .filter((trait) => trait.length > 0)

    const result = await saveManualBrandBlueprintAction({
      path:
        selectedPath ??
        activeBlueprint?.onboardingPath ??
        initialBlueprint?.onboardingPath ??
        "build_personal_brand",
      blueprint: {
        ...manualBlueprint,
        personalityTraits: cleanedTraits,
      },
      interviewAnswers: answers.map((answer) => answer.trim() || "Ingen svar registreret."),
      interviewTranscript: interviewTranscript.trim() || "Ingen interview-transskript registreret.",
    })

    if (!result.success) {
      setErrorMessage(formatActionErrorMessage(result))
      return
    }

    setActiveBlueprint(result.blueprint)
    setManualBlueprint(result.blueprint.blueprint)
    setIsEditingManual(false)
  }, [activeBlueprint?.onboardingPath, answers, initialBlueprint?.onboardingPath, interviewTranscript, manualBlueprint, selectedPath])

  return {
    selectedPath,
    setSelectedPath,
    questionIndex,
    currentQuestion,
    answers,
    setAnswers,
    stage,
    isRecording,
    errorMessage,
    activeBlueprint,
    manualBlueprint,
    setManualBlueprint,
    isEditingManual,
    setIsEditingManual,
    isApproving,
    canAnalyze,
    startRecording,
    stopRecording,
    goToNextQuestion,
    goToPreviousQuestion,
    runAnalysis,
    approveBlueprint,
    saveManualBlueprint,
  }
}
