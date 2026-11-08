const fs = require('fs');
const pdf = require('pdf-parse');
const path = require('path');

// Configuration
const PDF_PATH = path.join(__dirname, '../nhis_new.pdf');
const OUTPUT_CSV = path.join(__dirname, '../extracted_beneficiaries.csv');

async function extract() {
    if (!fs.existsSync(PDF_PATH)) {
        console.error("❌ Error: 'nhis_new.pdf' not found in project folder.");
        return;
    }

    console.log("🕒 Reading PDF (this can take up to 2 minutes for 4,800 pages)...");
    const dataBuffer = fs.readFileSync(PDF_PATH);
    
    // Improved detection of the function
    let parseFunc = pdf;
    if (typeof pdf !== 'function') {
        parseFunc = pdf.default || pdf.PDFParse || pdf.parse || Object.values(pdf).find(v => typeof v === 'function');
    }
    
    if (typeof parseFunc !== 'function') {
        throw new Error("Could not find a valid PDF parsing function in 'pdf-parse' library.");
    }
    
    const data = await parseFunc(dataBuffer);
    
    console.log(`✅ PDF Read! Pages: ${data.numpages}`);
    const lines = data.text.split('\n');
    const records = [];
    
    let currentPolicy = null;
    let currentHcp = null;

    console.log("🕒 Parsing lines...");
    
    for (const line of lines) {
        // Match HCP code (e.g., "AB/0001/P")
        const hcpMatch = line.match(/([A-Z]{2,3}\/\d{4}\/P)/);
        if (hcpMatch) currentHcp = hcpMatch[1];
        
        // Match "Family SURNAME Code – POLICY"
        const familyMatch = line.match(/Family\s+(\S+)\s+Code\s*[–\-‑]\s*(\d+)/i);
        if (familyMatch) {
            currentPolicy = familyMatch[2];
            continue;
        }
        
        // Match beneficiary rows
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
    
    // Write CSV
    const csvHeader = "policy_number,member_type,first_name,surname,full_name,gender,dob,hcp_code\n";
    const csvRows = records.map(r => 
        `"${r.policy_number}","${r.member_type}","${r.first_name}","${r.surname}","${r.full_name}","${r.gender}","${r.dob}","${r.hcp_code}"`
    ).join('\n');
    
    fs.writeFileSync(OUTPUT_CSV, csvHeader + csvRows);
    console.log(`🚀 Saved to: ${OUTPUT_CSV}`);
}

extract().catch(console.error);
