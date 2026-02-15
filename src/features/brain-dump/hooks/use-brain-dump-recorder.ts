"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { analyzeTranscriptAction } from "@/features/brain-dump/actions"
import { transcribeAudioBlob } from "@/features/brain-dump/service"
import type { ContentBrief } from "@/lib/types/domain"

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
  errorMessage: string | null
  isRecording: boolean
  statusLabel: string
}

type UseBrainDumpRecorderApi = {
  startRecording: () => Promise<void>
  stopRecording: () => void
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
  const isUnmountingRef = useRef(false)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const [stage, setStage] = useState<BrainDumpStage>("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [transcript, setTranscript] = useState("")
  const [brief, setBrief] = useState<ContentBrief | null>(null)

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
      setTranscript(nextTranscript)

      setStage("analyzing")
      const analysisResult = await analyzeTranscriptAction(nextTranscript)

      if (!analysisResult.success) {
        throw new Error(analysisResult.message)
      }

      const nextBrief = analysisResult.brief
      setBrief(nextBrief)
      setStage("ready")
    } catch (error: unknown) {
      setStage("error")
      if (error instanceof Error) {
        setErrorMessage(error.message)
      } else {
        setErrorMessage("Uventet fejl under behandling af brain dump.")
      }
    }
  }, [])

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
  }, [processCapturedAudio])

  const reset = useCallback(() => {
    if (recorderRef.current?.state === "recording") {
      return
    }

    setStage("idle")
    setErrorMessage(null)
    setTranscript("")
    setBrief(null)
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
    errorMessage,
    isRecording,
    statusLabel,
    startRecording,
    stopRecording,
    reset,
  }
}
