import {cleanup, fireEvent, screen, waitFor} from '@testing-library/react'
import {afterEach, describe, expect, it} from 'vitest'

import {renderWithUi} from '../test/renderWithUi'
import {WarningsMenu} from './WarningsMenu'

afterEach(() => cleanup())

const warnings = [
  "Edge for field 'author' on Article dropped — target type 'person' is filtered or not declared.",
  "More than one object is derived from the name 'caption'. Each is qualified by an underscore and its parent to keep them distinct in the diagram — consider giving them unique names.",
]

describe('WarningsMenu', () => {
  it('renders no button when there are no warnings', () => {
    renderWithUi(<WarningsMenu warnings={[]} />)
    expect(screen.queryByRole('button', {name: /warnings/i})).not.toBeInTheDocument()
  })

  it('renders the Warnings button, with the popover closed initially', () => {
    renderWithUi(<WarningsMenu warnings={warnings} />)
    expect(screen.getByRole('button', {name: /warnings/i})).toBeInTheDocument()
    // @sanity/ui v4 keeps a closed Popover mounted (React <Activity>) to preserve
    // its state, so "closed" is a visibility assertion, not an absence one.
    expect(screen.getByText(warnings[0]!)).not.toBeVisible()
  })

  it('opens the popover on click, listing each warning message', () => {
    renderWithUi(<WarningsMenu warnings={warnings} />)
    fireEvent.click(screen.getByRole('button', {name: /warnings/i}))
    expect(screen.getByText(warnings[0]!)).toBeInTheDocument()
    expect(screen.getByText(warnings[1]!)).toBeInTheDocument()
  })

  it('closes the popover when the button is clicked again', async () => {
    renderWithUi(<WarningsMenu warnings={warnings} />)
    const button = screen.getByRole('button', {name: /warnings/i})
    fireEvent.click(button)
    expect(screen.getByText(warnings[0]!)).toBeVisible()
    fireEvent.click(button)
    // In @sanity/ui v4 a Popover stays mounted when closed and hides *asynchronously*
    // (it runs an exit transition first), so this has to be awaited — unlike the
    // initial closed state, which is hidden from the first render.
    await waitFor(() => expect(screen.getByText(warnings[0]!)).not.toBeVisible())
  })
})
