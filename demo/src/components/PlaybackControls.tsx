// ============================================================
// PlaybackControls — reset / prev / play-pause / next + progress
// ============================================================

import { Button } from './Button'
import { ArrowPathIcon, ArrowLeftIcon, ArrowRightIcon, PlayIcon, PauseIcon } from '@heroicons/react/20/solid'

interface PlaybackControlsProps {
  currentStep: number
  totalSteps: number
  isPlaying: boolean
  onPrev: () => void
  onNext: () => void
  onPlay: () => void
  onPause: () => void
  onReset: () => void
  canGoPrev?: boolean
  canGoNext?: boolean
  canReset?: boolean
  isComplete?: boolean
}

export function PlaybackControls({
  currentStep,
  totalSteps,
  isPlaying,
  onPrev,
  onNext,
  onPlay,
  onPause,
  onReset,
  canGoPrev,
  canGoNext,
  canReset,
  isComplete,
}: PlaybackControlsProps) {
  const prev = canGoPrev ?? currentStep >= 0
  const next = canGoNext ?? currentStep < totalSteps - 1
  const reset = canReset ?? prev
  const complete = isComplete ?? (currentStep >= totalSteps - 1 && totalSteps > 0)
  const pct = totalSteps > 0 ? ((currentStep + 1) / totalSteps) * 100 : 0

  return (
    <div className="flex items-center justify-center gap-3">
      <Button
        variant="secondary"
        size="md"
        onClick={onReset}
        disabled={!reset}
        leftIcon={<ArrowPathIcon className="w-4 h-4" />}
      >
        重置
      </Button>

      <Button
        variant="secondary"
        size="md"
        onClick={onPrev}
        disabled={!prev}
        leftIcon={<ArrowLeftIcon className="w-4 h-4" />}
      >
        上一步
      </Button>

      {isPlaying ? (
        <Button
          variant="primary"
          size="md"
          onClick={onPause}
          leftIcon={<PauseIcon className="w-4 h-4" />}
        >
          暂停
        </Button>
      ) : (
        <Button
          variant="primary"
          size="md"
          onClick={onPlay}
          disabled={complete}
          leftIcon={<PlayIcon className="w-4 h-4" />}
        >
          自动播放
        </Button>
      )}

      <Button
        variant="secondary"
        size="md"
        onClick={onNext}
        disabled={!next}
        rightIcon={<ArrowRightIcon className="w-4 h-4" />}
      >
        下一步
      </Button>

      <div className="flex items-center gap-2 ml-2">
        <div className="w-32 h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs font-mono text-slate-400 w-20 text-center">
          {totalSteps > 0 ? `步骤 ${currentStep + 1} / ${totalSteps}` : '—'}
        </span>
        {complete && <span className="text-xs font-semibold text-emerald-400">✓ 完成</span>}
      </div>
    </div>
  )
}
