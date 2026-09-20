import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const archive = process.argv[2];
if (!archive) throw new Error('Uso: node tools/build-apac-catalog.mjs TabelaUnificada_YYYYMM.zip');
const read = name => execFileSync('tar', ['-xOf', archive, name], { maxBuffer: 32 * 1024 * 1024 })
  .toString('latin1').split(/\r?\n/).filter(Boolean);
const competence = read('tb_registro.txt')[0].slice(-6);
if (!/^20\d{4}$/.test(competence)) throw new Error('Competência inválida');
const names = new Map(read('tb_procedimento.txt').map(line => [line.slice(0, 10), line.slice(10, 260).trim()]));
const apacCodes = new Set(read('rl_procedimento_registro.txt')
  .filter(line => line.slice(10, 12) === '06').map(line => line.slice(0, 10)));
const procedures = [...apacCodes].filter(code => names.has(code)).sort()
  .map(code => ({ code, name: names.get(code) }));
const cids = read('tb_cid.txt').map(line => ({ code: line.slice(0, 4).trim(), name: line.slice(4, 104).trim() }))
  .filter(item => item.code && item.name);
const catalog = { competence, source: 'SIGTAP/DATASUS', procedures, cids };
const output = resolve('apac-catalog.json');
writeFileSync(output, JSON.stringify(catalog));
console.log(`${output}: ${procedures.length} procedimentos APAC principais, ${cids.length} CID-10, competência ${competence}`);
