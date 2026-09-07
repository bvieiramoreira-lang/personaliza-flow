const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');

class DisktenhaService {
  constructor() {
    this.table = [];
    this.filePath = null;
    this.lastLoaded = null;
    this.init();
  }

  findFile() {
    const candidates = [
      path.join(__dirname, '../../disktenha_personaliza.xlsx'),
      path.join(__dirname, '../data/disktenha_personaliza.xlsx'),
      path.join(process.cwd(), 'disktenha_personaliza.xlsx')
    ];

    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  init() {
    const foundPath = this.findFile();
    if (!foundPath) {
      console.warn('⚠️ [Disktenha] Planilha disktenha_personaliza.xlsx não encontrada.');
      return;
    }

    try {
      this.filePath = foundPath;
      const wb = xlsx.readFile(foundPath);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

      const parsedTable = [];
      for (let i = 2; i < data.length; i++) {
        const row = data[i];
        if (!row || !row[0]) continue;

        const city = String(row[0]).trim();
        let cepStart = parseInt(String(row[1] || '').replace(/\D/g, ''), 10);
        let cepEnd = parseInt(String(row[2] || '').replace(/\D/g, ''), 10);
        const cost = parseFloat(row[5]);
        const days = parseInt(row[6], 10) || 2;
        const method = row[7] ? String(row[7]).trim() : 'Expressa (DiskTenha)';

        if (!isNaN(cepStart) && !isNaN(cepEnd) && !isNaN(cost)) {
          // Normalização: se o CEP de início terminar em 001 (ex: 88000001), o CEP base municipal é 88000000
          if (cepStart % 1000 === 1) {
            cepStart = cepStart - 1;
          }

          parsedTable.push({
            city,
            cepStart,
            cepEnd,
            cost,
            days,
            method
          });
        }
      }

      this.table = parsedTable;
      this.lastLoaded = new Date();
      console.log(`✅ [Disktenha] Tabela carregada com sucesso: ${this.table.length} cidades atendidas.`);
    } catch (err) {
      console.error('❌ [Disktenha] Erro ao carregar planilha:', err.message);
    }
  }

  getQuoteForCep(destCep) {
    if (!destCep) return null;
    const cleanCep = String(destCep).replace(/\D/g, '');
    const cepNum = parseInt(cleanCep, 10);
    if (isNaN(cepNum)) return null;

    if (!this.table || this.table.length === 0) {
      this.init();
    }

    const match = this.table.find(r => cepNum >= r.cepStart && cepNum <= r.cepEnd);
    if (!match) return null;

    return {
      carrier: 'DiskTenha',
      service: match.method || 'Expressa (DiskTenha)',
      price: match.cost,
      delivery_days: match.days,
      city: match.city,
      is_table: true
    };
  }

  getAllCities() {
    if (!this.table || this.table.length === 0) this.init();
    return this.table;
  }

  getSummary() {
    if (!this.table || this.table.length === 0) this.init();
    return {
      active: this.table.length > 0,
      total_cities: this.table.length,
      file_path: this.filePath,
      last_loaded: this.lastLoaded,
      sample_cities: this.table.slice(0, 10).map(c => c.city)
    };
  }

  reload() {
    this.init();
    return this.getSummary();
  }
}

const disktenhaService = new DisktenhaService();
module.exports = disktenhaService;
