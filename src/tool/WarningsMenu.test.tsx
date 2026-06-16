import {cleanup, fireEvent, screen} from '@testing-library/react'
import {afterEach, describe, expect, it} from 'vitest'

import {renderWithUi} from '../test/renderWithUi'
import {WarningsMenu} from './WarningsMenu'

afterEach(() => cleanup())

const warnings = [
  "Edge for field 'author' on Article dropped — target type 'person' is filtered or not declared.",
  "Inline object 'caption' appears in multiple classes; emitted with parent prefix to disambiguate.",
]

describe('WarningsMenu', () => {
  it('renders no button when there are no warnings', () => {
    renderWithUi(<WarningsMenu warnings={[]} />)
    expect(screen.queryByRole('button', {name: /warnings/i})).not.toBeInTheDocument()
  })

  it('renders the Warnings button, with the popover closed initially', () => {
    renderWithUi(<WarningsMenu warnings={warnings} />)
    expect(screen.getByRole('button', {name: /warnings/i})).toBeInTheDocument()
    expect(screen.queryByText(warnings[0]!)).not.toBeInTheDocument()
  })

  it('opens the popover on click, listing each warning message', () => {
    renderWithUi(<WarningsMenu warnings={warnings} />)
    fireEvent.click(screen.getByRole('button', {name: /warnings/i}))
    expect(screen.getByText(warnings[0]!)).toBeInTheDocument()
    expect(screen.getByText(warnings[1]!)).toBeInTheDocument()
  })

  it('closes the popover when the button is clicked again', () => {
    renderWithUi(<WarningsMenu warnings={warnings} />)
    const button = screen.getByRole('button', {name: /warnings/i})
    fireEvent.click(button)
    expect(screen.getByText(warnings[0]!)).toBeInTheDocument()
    fireEvent.click(button)
    expect(screen.queryByText(warnings[0]!)).not.toBeInTheDocument()
  })
})
