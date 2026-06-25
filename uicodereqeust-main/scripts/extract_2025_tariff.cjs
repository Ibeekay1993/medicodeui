const fs = require('fs');
const pdf = require('pdf-parse');

async function extractTariff(filePath) {
    try {
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdf(dataBuffer);
        return data.text;
    } catch (err) {
        console.error(`Error reading ${filePath}:`, err.message);
        return "";
    }
}

async function run() {
    console.log("--- Starting 2025 Clinical Protocol Extraction (CJS Standard) ---");
    
    try {
        const medicineText = await extractTariff('c:/Users/WINDOWS/Downloads/Med code updated/uicodereqeust-main/NHIA Medicine Price List 2025.pdf');
        if (medicineText) console.log("✓ Indexed Medicine Price List (2025)");
        
        const procedureText = await extractTariff('c:/Users/WINDOWS/Downloads/Med code updated/uicodereqeust-main/NHIA Procedure Price List 2025.pdf');
        if (procedureText) console.log("✓ Indexed Procedure Price List (2025)");

        const combinedKnowledge = `
            NHIA OFFICIAL PROTOCOL 2025
            ============================
            
            MEDICINE PRICE LIST:
            ${medicineText.slice(0, 15000)}...
            
            PROCEDURE PRICE LIST:
            ${procedureText.slice(0, 15000)}...
        `;

        fs.writeFileSync('c:/Users/WINDOWS/Downloads/Med code updated/uicodereqeust-main/hmo_tariff_2025.txt', combinedKnowledge);
        console.log("✓ Success: NHIA 2025 Clinical Knowledge Base ready!");
        
    } catch (err) {
        console.error("Extraction failed:", err.message);
    }
}

run();
