import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const fs = require('fs');
const pdf = require('pdf-parse');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const PDF_PATH = join(__dirname, '../nhis_new.pdf');
const OUTPUT_CSV = join(__dirname, '../extracted_beneficiaries.csv');

async function extract() {
    if (!fs.existsSync(PDF_PATH)) {
        console.error(`❌ Error: 'nhis_new.pdf' not found at ${PDF_PATH}`);
        return;
    }

    console.log("🕒 Reading PDF (this can take up to 2 minutes for 4,800 pages)...");
    const dataBuffer = fs.readFileSync(PDF_PATH);
    
    // Final check for calling the parser
    let data;
    try {
        if (typeof pdf === 'function') {
            data = await pdf(dataBuffer);
        } else if (pdf.PDFParse) {
            data = await new pdf.PDFParse(dataBuffer);
        } else {
            // Last resort: find any function
            const anyFunc = Object.values(pdf).find(v => typeof v === 'function');
            data = await anyFunc(dataBuffer);
        }
    } catch (e) {
        // Handle class constructor error by using 'new'
        if (e.message.includes("Class constructors cannot be invoked without 'new'")) {
            const anyClass = Object.values(pdf).find(v => typeof v === 'function');
            data = await new anyClass(dataBuffer);
        } else {
            throw e;
        }
    }
    
    console.log(`✅ PDF Read! Pages: ${data.numpages || 'unknown'}`);
    const text = data.text || '';
    if (!text) {
        console.warn("⚠️ Warning: No text extracted. The PDF might be scanned/images only.");
    }
    
    const lines = text.split('\n');
    const records = [];
    
    let currentPolicy = null;
    let currentHcp = null;

    console.log("🕒 Parsing lines...");
    
    for (const line of lines) {
        const hcpMatch = line.match(/([A-Z]{2,3}\/\d{4}\/P)/);
        if (hcpMatch) currentHcp = hcpMatch[1];
        
        const familyMatch = line.match(/Family\s+(\S+)\s+Code\s*[–\-‑]\s*(\d+)/i);
        if (familyMatch) {
            currentPolicy = familyMatch[2];
            continue;
        }
        
        const rowMatch = line.match(/\s*\d+\s+(\d+)[‑\-]\d+\s+(PRINCIPAL|SPOUSE|CHILD\s*\d*)\s+(\S+)\s+(\S+)\s+([MF])\s+(\d{2}\/\d{2}\/\d{4})/);
        if (rowMatch && currentPolicy) {
            records.push({
                policy_number: currentPolicy,
                member_type: rowMatch[2].trim(),
                first_name: rowMatch[3],
                surname: rowMatch[4],
                full_name: `${rowMatch[4]} ${rowMatch[3]}`,
                gender: rowMatch[5],
                dob: rowMatch[6],
                hcp_code: currentHcp || ''
            });
        }
    }

    console.log(`✅ Extraction Complete! Found ${records.length} records.`);
    
    const csvHeader = "policy_number,member_type,first_name,surname,full_name,gender,dob,hcp_code\n";
    const csvRows = records.map(r => 
        `"${r.policy_number}","${r.member_type}","${r.first_name}","${r.surname}","${r.full_name}","${r.gender}","${r.dob}","${r.hcp_code}"`
    ).join('\n');
    
    fs.writeFileSync(OUTPUT_CSV, csvHeader + csvRows);
    console.log(`🚀 Saved to: ${OUTPUT_CSV}`);
}

extract().catch(console.error);
