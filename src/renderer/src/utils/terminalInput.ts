interface KeyLike {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
}

/**
 * Translate a browser keyboard event to the terminal escape sequence the pty expects.
 * Returns null for keys that should be ignored or handled by the OS/browser.
 */
export function keyToSequence(e: KeyLike): string | null {
  const { key, ctrlKey, metaKey, altKey, shiftKey } = e

  // Let macOS handle Cmd+key (copy, paste, quit, etc.)
  if (metaKey) return null

  // Ctrl combos
  if (ctrlKey && !altKey) {
    switch (key.toLowerCase()) {
      case 'c': return '\x03'
      case 'd': return '\x04'
      case 'z': return '\x1a'
      case 'l': return '\x0c'
      case 'a': return '\x01'
      case 'e': return '\x05'
      case 'k': return '\x0b'
      case 'u': return '\x15'
      case 'w': return '\x17'
      case 'r': return '\x12'
      case 'p': return '\x10'
      case 'n': return '\x0e'
      case 'b': return '\x02'
      case 'f': return '\x06'
      case 't': return '\x14'
      case '[': return '\x1b'
      case '\\': return '\x1c'
      case ']': return '\x1d'
    }
    if (key.length === 1) {
      const code = key.toLowerCase().charCodeAt(0) - 96
      if (code >= 1 && code <= 26) return String.fromCharCode(code)
    }
    return null
  }

  // Alt/Option+key → ESC prefix
  if (altKey && !ctrlKey && key.length === 1) return '\x1b' + key

  // Cursor / navigation keys
  switch (key) {
    case 'ArrowUp':    return '\x1b[A'
    case 'ArrowDown':  return '\x1b[B'
    case 'ArrowRight': return '\x1b[C'
    case 'ArrowLeft':  return '\x1b[D'
    case 'Enter':      return '\r'
    case 'Backspace':  return '\x7f'
    case 'Tab':        return shiftKey ? '\x1b[Z' : '\t'
    case 'Escape':     return '\x1b'
    case 'Delete':     return '\x1b[3~'
    case 'Insert':     return '\x1b[2~'
    case 'Home':       return '\x1b[H'
    case 'End':        return '\x1b[F'
    case 'PageUp':     return '\x1b[5~'
    case 'PageDown':   return '\x1b[6~'
    case 'F1':  return '\x1bOP'
    case 'F2':  return '\x1bOQ'
    case 'F3':  return '\x1bOR'
    case 'F4':  return '\x1bOS'
    case 'F5':  return '\x1b[15~'
    case 'F6':  return '\x1b[17~'
    case 'F7':  return '\x1b[18~'
    case 'F8':  return '\x1b[19~'
    case 'F9':  return '\x1b[20~'
    case 'F10': return '\x1b[21~'
    case 'F11': return '\x1b[23~'
    case 'F12': return '\x1b[24~'
  }

  // Printable characters
  if (key.length === 1 && !ctrlKey && !altKey) return key

  return null
}
