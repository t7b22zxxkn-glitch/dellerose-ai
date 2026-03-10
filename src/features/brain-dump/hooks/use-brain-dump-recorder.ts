"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { generatePlatformDraftsAction } from "@/features/agent-engine/actions"
import { analyzeTranscriptAction } from "@/features/brain-dump/actions"
import { generateMediaContext, transcribeAudioBlob } from "@/features/brain-dump/service"
import {
  getWorkflowSnapshot,
  useWorkflowStore,
} from "@/features/workflow/store"
import { formatActionErrorMessage } from "@/lib/server-actions/contracts"
import type { AgentOutput, ContentBrief } from "@/lib/types/domain"

export type BrainDumpStage =
  | "idle"
  | "unsupported"
  | "listening"
  | "transcribing"
  | "analyzing"
  | "ready"
  | "error"

type UseBrainDumpRecorderState = {
  stage: BrainDumpStage
  transcript: string
  brief: ContentBrief | null
  platformDrafts: AgentOutput[]
  isGeneratingDrafts: boolean
  isAnalyzingMedia: boolean
  platformDraftErrorMessage: string | null
  errorMessage: string | null
  mediaContextNote: string | null
  attachedMediaFiles: File[]
  isRecording: boolean
  statusLabel: string
}

type UseBrainDumpRecorderApi = {
  startRecording: () => Promise<void>
  stopRecording: () => void
  generatePlatformDrafts: () => Promise<void>
  setAttachedMediaFiles: (files: File[]) => void
  reset: () => void
}

const PREFERRED_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
]

function resolveSupportedMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") {
    return undefined
  }

  for (const mimeType of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType
    }
  }

  return undefined
}

function stopStream(stream: MediaStream | null) {
  if (!stream) {
    return
  }

  for (const track of stream.getTracks()) {
    track.stop()
  }
}

export function useBrainDumpRecorder(): UseBrainDumpRecorderState &
  UseBrainDumpRecorderApi {
  const initialWorkflow = getWorkflowSnapshot()
  const setBrainDumpResult = useWorkflowStore((state) => state.setBrainDumpResult)
  const setWorkflowDrafts = useWorkflowStore((state) => state.setDrafts)
  const resetWorkflow = useWorkflowStore((state) => state.resetWorkflow)
  const workflowId = useWorkflowStore((state) => state.workflowId)

  const isUnmountingRef = useRef(false)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const attachedMediaFilesRef = useRef<File[]>([])

  const [stage, setStage] = useState<BrainDumpStage>(
    initialWorkflow.brief ? "ready" : "idle"
  )
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [transcript, setTranscript] = useState(initialWorkflow.transcript)
  const [brief, setBrief] = useState<ContentBrief | null>(initialWorkflow.brief)
  const [platformDrafts, setPlatformDrafts] = useState<AgentOutput[]>(
    initialWorkflow.drafts
  )
  const [attachedMediaFiles, setAttachedMediaFilesState] = useState<File[]>([])
  const [mediaContextNote, setMediaContextNote] = useState<string | null>(null)
  const [isAnalyzingMedia, setIsAnalyzingMedia] = useState(false)
  const [isGeneratingDrafts, setIsGeneratingDrafts] = useState(false)
  const [platformDraftErrorMessage, setPlatformDraftErrorMessage] = useState<
    string | null
  >(null)

  const isRecording = stage === "listening"

  const statusLabel = useMemo(() => {
    switch (stage) {
      case "idle":
        return "Klar til at lytte"
      case "unsupported":
        return "Browseren understøtter ikke lydoptagelse"
      case "listening":
        return "Lytter..."
      case "transcribing":
        return "Transskriberer..."
      case "analyzing":
        return "Analyserer..."
      case "ready":
        return "Klar — transcript og brief er klar"
      case "error":
        return "Der opstod en fejl"
      default:
        return "Klar"
    }
  }, [stage])

  const processCapturedAudio = useCallback(async () => {
    const mimeType =
      recorderRef.current?.mimeType || chunksRef.current[0]?.type || "audio/webm"
    const audioBlob = new Blob(chunksRef.current, { type: mimeType })

    if (audioBlob.size === 0) {
      setStage("error")
      setErrorMessage("Optagelsen var tom. Prøv igen.")
      return
    }

    setStage("transcribing")

    try {
      const nextTranscript = await transcribeAudioBlob(audioBlob)
      let transcriptForAnalysis = nextTranscript

      if (attachedMediaFilesRef.current.length > 0) {
        setIsAnalyzingMedia(true)
        try {
          const mediaContext = await generateMediaContext(attachedMediaFilesRef.current)
          if (mediaContext) {
            setMediaContextNote(mediaContext)
            transcriptForAnalysis = `${nextTranscript}\n\n[Visuel kontekst]\n${mediaContext}`
          } else {
            setMediaContextNote(null)
          }
        } catch {
          // Media analysis should not block core transcript analysis.
          setMediaContextNote(
            "Media blev vedhæftet, men kunne ikke analyseres automatisk. Beskriv visuelt indhold i din voice-over."
          )
        } finally {
          setIsAnalyzingMedia(false)
        }
      } else {
        setMediaContextNote(null)
      }

      setTranscript(transcriptForAnalysis)

      setStage("analyzing")
      const analysisResult = await analyzeTranscriptAction(transcriptForAnalysis)

      if (!analysisResult.success) {
        throw new Error(formatActionErrorMessage(analysisResult))
      }

      const nextBrief = analysisResult.brief
      setBrief(nextBrief)
      setStage("ready")
      setBrainDumpResult(transcriptForAnalysis, nextBrief)
    } catch (error: unknown) {
      setIsAnalyzingMedia(false)
      setStage("error")
      if (error instanceof Error) {
        setErrorMessage(error.message)
      } else {
        setErrorMessage("Uventet fejl under behandling af brain dump.")
      }
    }
  }, [setBrainDumpResult])

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current

    if (!recorder || recorder.state === "inactive") {
      return
    }

    recorder.stop()
  }, [])

  const startRecording = useCallback(async () => {
    if (
      typeof window === "undefined" ||
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setStage("unsupported")
      setErrorMessage(
        "Din browser understøtter ikke lydoptagelse via MediaRecorder."
      )
      return
    }

    try {
      setErrorMessage(null)
      setTranscript("")
      setBrief(null)
      setMediaContextNote(null)
      setPlatformDrafts([])
      setPlatformDraftErrorMessage(null)
      resetWorkflow()

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const preferredMimeType = resolveSupportedMimeType()
      const recorder = preferredMimeType
        ? new MediaRecorder(stream, { mimeType: preferredMimeType })
        : new MediaRecorder(stream)

      recorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      recorder.onerror = () => {
        setStage("error")
        setErrorMessage("Lydoptagelsen fejlede. Prøv igen.")
        stopStream(streamRef.current)
        streamRef.current = null
      }

      recorder.onstop = () => {
        stopStream(streamRef.current)
        streamRef.current = null
        if (!isUnmountingRef.current) {
          void processCapturedAudio()
        }
      }

      recorder.start()
      setStage("listening")
    } catch {
      setStage("error")
      setErrorMessage(
        "Mikrofonadgang blev afvist eller kunne ikke initialiseres."
      )
    }
  }, [processCapturedAudio, resetWorkflow])

  const reset = useCallback(() => {
    if (recorderRef.current?.state === "recording") {
      return
    }

    setStage("idle")
    setErrorMessage(null)
    setTranscript("")
    setBrief(null)
    setMediaContextNote(null)
    setAttachedMediaFilesState([])
    attachedMediaFilesRef.current = []
    setPlatformDrafts([])
    setPlatformDraftErrorMessage(null)
    resetWorkflow()
  }, [resetWorkflow])

  const generatePlatformDrafts = useCallback(async () => {
    if (
      !brief ||
      stage === "listening" ||
      stage === "transcribing" ||
      stage === "analyzing"
    ) {
      return
    }

    try {
      setIsGeneratingDrafts(true)
      setPlatformDraftErrorMessage(null)

      const result = await generatePlatformDraftsAction(brief, workflowId)

      if (!result.success) {
        setPlatformDrafts([])
        setPlatformDraftErrorMessage(formatActionErrorMessage(result))
        return
      }

      setPlatformDrafts(result.outputs)
      setWorkflowDrafts(result.outputs, result.qualityReport)
    } catch {
      setPlatformDrafts([])
      setPlatformDraftErrorMessage(
        "Platform-drafts kunne ikke genereres. Prøv igen."
      )
    } finally {
      setIsGeneratingDrafts(false)
    }
  }, [brief, setWorkflowDrafts, stage, workflowId])

  const setAttachedMediaFiles = useCallback((files: File[]) => {
    const normalized = files.slice(0, 4)
    attachedMediaFilesRef.current = normalized
    setAttachedMediaFilesState(normalized)
  }, [])

  useEffect(() => {
    return () => {
      isUnmountingRef.current = true

      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop()
      }
      stopStream(streamRef.current)
      streamRef.current = null
    }
  }, [])

  return {
    stage,
    transcript,
    brief,
    platformDrafts,
    isAnalyzingMedia,
    isGeneratingDrafts,
    platformDraftErrorMessage,
    errorMessage,
    mediaContextNote,
    attachedMediaFiles,
    isRecording,
    statusLabel,
    startRecording,
    stopRecording,
    generatePlatformDrafts,
    setAttachedMediaFiles,
    reset,
  }
}
