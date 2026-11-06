// Minimal layout-aware DOM used by the locate contracts. It is deliberately
// small: the Client only needs attributes, text, geometry, scrolling, and
// disclosure clicks, and modelling those faithfully is what makes a "the block
// is centered" assertion meaningful without a browser.
const VIEWPORT = 800

function camel(name) {
  return name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
}

class ClassList {
  constructor(element) {
    this.element = element
    this.set = new Set()
  }
  add(...names) {
    for (const name of names) if (name) this.set.add(name)
  }
  remove(...names) {
    for (const name of names) this.set.delete(name)
  }
  contains(name) {
    return this.set.has(name)
  }
  toggle(name, force) {
    const next = force === undefined ? !this.set.has(name) : force
    if (next) this.set.add(name)
    else this.set.delete(name)
    return next
  }
}

class TextNode {
  constructor(value, parentElement) {
    this.nodeValue = value
    this.parentElement = parentElement
    this.nodeType = 3
  }
}

class Element {
  constructor(tag, attrs = {}, children = [], options = {}) {
    this.tagName = String(tag).toUpperCase()
    this.nodeType = 1
    this.attrs = new Map()
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || value === null || value === false) continue
      this.attrs.set(key, value === true ? '' : String(value))
    }
    this.children = []
    this.parentElement = null
    for (const child of children) this.append(child)
    this.classList = new ClassList(this)
    this._text = options.text ?? null
    this._fixedHeight = options.height ?? null
    this._gap = options.gap ?? 0
    this._scrollable = options.scrollable === true
    this._viewport = options.viewport ?? 0
    this._onClick = options.onClick ?? null
    this.scrollTop = 0
    this._height = 0
    this._absTop = 0
    this.dataset = {}
    this._syncDataset()
  }
  _syncDataset() {
    for (const [key, value] of this.attrs) {
      if (!key.startsWith('data-')) continue
      this.dataset[camel(key.slice(5))] = value
    }
  }
  append(child) {
    if (!(child instanceof Element)) child = new Element('span', {}, [], { text: String(child) })
    child.parentElement = this
    this.children.push(child)
    return child
  }
  get textContent() {
    let text = this._text ?? ''
    for (const child of this.children) text += child.textContent
    return text
  }
  set textContent(value) {
    this.children = []
    this._text = String(value)
  }
  getAttribute(name) {
    return this.attrs.has(name) ? this.attrs.get(name) : null
  }
  setAttribute(name, value) {
    this.attrs.set(name, value === true ? '' : String(value))
    this._syncDataset()
  }
  removeAttribute(name) {
    this.attrs.delete(name)
    this._syncDataset()
  }
  hasAttribute(name) {
    return this.attrs.has(name)
  }
  get hidden() {
    return this.attrs.has('hidden')
  }
  get offsetWidth() {
    return this._height || 0
  }
  get clientHeight() {
    return this._scrollable ? this._viewport : this._height
  }
  get scrollHeight() {
    if (!this._scrollable) return this._height
    return Math.max(this._contentHeight ?? 0, this._viewport)
  }
  contains(other) {
    let node = other
    while (node) {
      if (node === this) return true
      node = node.parentElement
    }
    return false
  }
  matches(selector) {
    return matchSelector(this, selector)
  }
  closest(selector) {
    let node = this
    while (node) {
      if (matchSelector(node, selector)) return node
      node = node.parentElement
    }
    return null
  }
  querySelectorAll(selector) {
    const out = []
    const visit = (element) => {
      for (const child of element.children) {
        if (matchSelector(child, selector)) out.push(child)
        visit(child)
      }
    }
    visit(this)
    return out
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null
  }
  getBoundingClientRect() {
    const height = this._height
    const top = this._absTop - scrollOffsetOf(this)
    return {
      top,
      bottom: top + height,
      height,
      left: 0,
      right: 760,
      width: 760,
      x: 0,
      y: top,
    }
  }
  scrollIntoView(options = {}) {
    const block = options && options.block
    let node = this.parentElement
    while (node) {
      if (node._scrollable && node.clientHeight > 0) {
        const contentTop = this._absTop - node._absTop
        const max = Math.max(0, node._contentHeight - node._viewport)
        let target
        if (block === 'center') target = contentTop + this._height / 2 - node._viewport / 2
        else if (block === 'end') target = contentTop + this._height - node._viewport
        else target = contentTop
        node.scrollTop = Math.max(0, Math.min(max, Math.round(target)))
      }
      node = node.parentElement
    }
  }
  click() {
    let node = this
    while (node) {
      if (node._onClick) {
        node._onClick(node)
        return
      }
      node = node.parentElement
    }
  }
  addEventListener() {}
  removeEventListener() {}
}

function scrollOffsetOf(element) {
  let total = 0
  let node = element.parentElement
  while (node) {
    if (node._scrollable) total += node.scrollTop
    node = node.parentElement
  }
  return total
}

function parseCompound(text) {
  const tag = (/^([a-zA-Z0-9*]+)/.exec(text) || [])[1] || '*'
  const attrs = []
  const pattern = /\[([a-zA-Z0-9_-]+)(?:="([^"]*)")?\]/g
  let match
  while ((match = pattern.exec(text)) !== null) attrs.push({ name: match[1], value: match[2] })
  return { tag: tag.toLowerCase(), attrs }
}

function matchCompound(element, compound) {
  if (compound.tag !== '*' && element.tagName.toLowerCase() !== compound.tag) return false
  for (const attr of compound.attrs) {
    if (!element.attrs.has(attr.name)) return false
    if (attr.value !== undefined && element.attrs.get(attr.name) !== attr.value) return false
  }
  return true
}

const selectorCache = new Map()
function parseSelector(selector) {
  if (selectorCache.has(selector)) return selectorCache.get(selector)
  const groups = String(selector)
    .split(',')
    .map((group) => group.trim())
    .filter(Boolean)
    .map((group) => group.split(/\s+/).map(parseCompound))
  selectorCache.set(selector, groups)
  return groups
}

function matchSelector(element, selector) {
  const groups = parseSelector(selector)
  for (const parts of groups) {
    if (!matchCompound(element, parts[parts.length - 1])) continue
    let index = parts.length - 2
    let node = element.parentElement
    while (index >= 0 && node) {
      if (matchCompound(node, parts[index])) index -= 1
      node = node.parentElement
    }
    if (index < 0) return true
  }
  return false
}

function measure(element) {
  if (element.attrs.has('hidden')) {
    element._height = 0
    for (const child of element.children) measure(child)
    return 0
  }
  if (element._fixedHeight !== null) {
    element._height = element._fixedHeight
    for (const child of element.children) measure(child)
    return element._height
  }
  let height = element._text ? 24 : 0
  for (const child of element.children) height += measure(child) + element._gap
  element._height = Math.max(height, element.children.length === 0 && !element._text ? 24 : 0)
  return element._height
}

function place(element, top) {
  element._absTop = top
  if (element._scrollable) {
    let content = 0
    for (const child of element.children) content += child._height + element._gap
    element._contentHeight = content
    element._height = element._viewport
  }
  let cursor = top
  for (const child of element.children) {
    place(child, cursor)
    cursor += child._height + element._gap
  }
}

class Document {
  constructor() {
    this.head = new Element('head', {}, [], { height: 0 })
    this.body = new Element('body')
    this.documentElement = new Element('html', {}, [this.head, this.body], {})
    this.head.parentElement = this.documentElement
    this.body.parentElement = this.documentElement
  }
  createElement(tag) {
    return new Element(tag)
  }
  querySelectorAll(selector) {
    return this.documentElement.querySelectorAll(selector)
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null
  }
  createTreeWalker(root) {
    const nodes = []
    const visit = (element) => {
      if (element._text) nodes.push(new TextNode(element._text, element))
      for (const child of element.children) visit(child)
    }
    visit(root)
    let index = 0
    return {
      nextNode() {
        return nodes[index++] ?? null
      },
    }
  }
  createRange() {
    return {
      setStart() {},
      setEnd() {},
      startContainer: null,
    }
  }
}

export function createDom() {
  const document = new Document()
  const CSS = { highlights: new Map() }
  class Highlight {
    constructor(...ranges) {
      this.ranges = ranges
    }
  }
  const window = {
    innerHeight: VIEWPORT,
    requestAnimationFrame: (callback) => setTimeout(callback, 0),
    setTimeout,
    clearTimeout,
    CSS,
    Highlight,
    getSelection: () => ({ removeAllRanges() {}, addRange() {}, rangeCount: 0, isCollapsed: true, getRangeAt: () => null }),
    find: undefined,
    matchMedia: () => ({ matches: false }),
  }
  const sandbox = {
    document,
    window,
    CSS,
    NodeFilter: { SHOW_TEXT: 4 },
    console,
  }
  function refresh() {
    measure(document.documentElement)
    place(document.documentElement, 0)
  }
  return {
    document,
    window,
    CSS,
    NodeFilter: sandbox.NodeFilter,
    sandbox,
    root: document.body,
    mount(element) {
      document.body.append(element)
      refresh()
      return element
    },
    refresh,
  }
}

export function el(tag, attrs = {}, children = [], options = {}) {
  return new Element(tag, attrs, children, options)
}
