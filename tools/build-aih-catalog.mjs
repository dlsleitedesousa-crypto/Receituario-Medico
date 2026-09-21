import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const archive = process.argv[2];
if (!archive) throw new Error('Uso: node tools/build-aih-catalog.mjs TabelaUnificada_YYYYMM.zip');
const read = name => new TextDecoder('windows-1252').decode(
  execFileSync('tar', ['-xOf', archive, name], { maxBuffer: 32 * 1024 * 1024 })
).split(/\r?\n/).filter(Boolean);
const competence = read('tb_registro.txt')[0].slice(-6);
if (!/^20\d{4}$/.test(competence)) throw new Error('Competência inválida');
const names = new Map(read('tb_procedimento.txt').map(line => [line.slice(0, 10), line.slice(10, 260).trim()]));
const codes = new Set(read('rl_procedimento_registro.txt')
  .filter(line => line.slice(10, 12) === '03').map(line => line.slice(0, 10)));
const procedures = [...codes].filter(code => names.has(code)).sort()
  .map(code => ({ code, name: names.get(code) }));
const output = resolve('aih-catalog.json');
writeFileSync(output, JSON.stringify({ competence, source: 'SIGTAP/DATASUS', procedures }));
console.log(`${output}: ${procedures.length} procedimentos AIH principais, competência ${competence}`);
