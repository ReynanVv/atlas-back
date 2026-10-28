import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const MAX_LINES = 350
const LEGACY_OVERSIZED = new Set(['server.js', 'atlas-extra.js'])
const roots = ['server.js', 'atlas-extra.js', 'src']
const files = []

function walk(target) {
  if (!fs.existsSync(target)) return
  const stat = fs.statSync(target)
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(target)) walk(path.join(target, name))
  } else if (/\.(js|mjs)$/.test(target)) {
    files.push(target)
  }
}

for (const root of roots) walk(path.join(ROOT, root))

const failures=[]
const warnings=[]

for (const file of files) {
  const relative=path.relative(ROOT,file).replaceAll('\\','/')
  const content=fs.readFileSync(file,'utf8')
  const lineCount=content.split(/\r?\n/).length

  if (lineCount > MAX_LINES) {
    if (LEGACY_OVERSIZED.has(relative)) warnings.push(`${relative}: ${lineCount} linhas (legado; refatoração incremental)`)
    else failures.push(`${relative}: ${lineCount} linhas excede o teto de ${MAX_LINES}`)
  }

  if (relative !== 'server.js' && /\bintensity\b|intensidade/i.test(content)) {
    failures.push(`${relative}: "intensidade" foi removida do domínio do Atlas`)
  }
}

if (warnings.length) {
  console.warn('Avisos de qualidade:')
  for (const warning of warnings) console.warn(' - ' + warning)
}

if (failures.length) {
  console.error('Falhas de qualidade:')
  for (const failure of failures) console.error(' - ' + failure)
  process.exit(1)
}

console.log(`Quality gate OK: ${files.length} arquivos verificados.`)
