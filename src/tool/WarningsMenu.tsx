import {WarningOutlineIcon} from '@sanity/icons'
import {Box, Button, Flex, Popover, Stack, Text, Tooltip, useClickOutsideEvent} from '@sanity/ui'
import {useState} from 'react'

// Roughly 72 characters at Text size={1} — the readable line length the issue
// asks for. A fixed width (rather than the full-bleed Card the warnings used to
// render in) is what keeps each message legible. Eyeball-tunable.
const CONTENT_WIDTH = 460

export interface WarningsMenuProps {
  /**
   * The walker's non-blocking modeling warnings (dropped edges, name
   * collisions, field-type reuse). The menu renders nothing when empty, so the
   * "no button when there's nothing to warn about" rule lives here rather than
   * in the tool.
   */
  warnings: string[]
}

/**
 * The Warnings control: a top-bar icon button — shown only when warnings exist
 * — that reveals a popover listing each modeling warning on its own row, at a
 * readable line length. Mirrors `ElementsMenu`'s open/close wiring (toggle on
 * the button, click-outside to dismiss).
 *
 * Presentational: it holds only its open/closed state and renders the strings
 * the (pure) walker produced — it neither computes nor reshapes them.
 */
export function WarningsMenu({warnings}: WarningsMenuProps): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  const [referenceElement, setReferenceElement] = useState<HTMLButtonElement | null>(null)
  const [popoverElement, setPopoverElement] = useState<HTMLElement | null>(null)

  useClickOutsideEvent(open ? () => setOpen(false) : undefined, () => [
    referenceElement,
    popoverElement,
  ])

  if (warnings.length === 0) return null

  const content = (
    <Box
      ref={setPopoverElement}
      overflow="auto"
      padding={3}
      style={{maxHeight: '70vh', width: CONTENT_WIDTH}}
    >
      <Stack gap={3}>
        <Text size={1} weight="semibold" muted>
          Potential issues
        </Text>
        {warnings.map((warning) => (
          // Each warning on its own icon-prefixed row so they read as distinct
          // messages rather than one run-on block. `align="flex-start"` keeps
          // the icon pinned to the first line of a wrapped message.
          <Flex key={warning} align="flex-start" gap={2}>
            <Text size={1} muted>
              <WarningOutlineIcon />
            </Text>
            <Text size={1}>{warning}</Text>
          </Flex>
        ))}
      </Stack>
    </Box>
  )

  return (
    <Tooltip
      content={
        <Box padding={2}>
          <Text size={1}>View detected potential issues with this content model.</Text>
        </Box>
      }
      placement="bottom"
      portal
      disabled={open}
    >
      <Popover open={open} content={content} placement="bottom-end" portal constrainSize>
        <Button
          ref={setReferenceElement}
          aria-label="Warnings"
          icon={WarningOutlineIcon}
          mode="ghost"
          fontSize={1}
          selected={open}
          onClick={() => setOpen((o) => !o)}
        />
      </Popover>
    </Tooltip>
  )
}
