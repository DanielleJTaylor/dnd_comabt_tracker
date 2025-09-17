// scripts/statblock-import.js

/**
 * A more advanced parser for D&D 5e statblock text.
 * It identifies sections like "Actions" and "Reactions"
 * and returns a structured object.
 */
function parseStatblockText(text) {
    const lines = text.split('\n').map(l => l.trim());
    const result = {
        name: lines[0] || 'Unnamed Creature',
        meta: lines[1] || '',
        abilities: {},
        traits: [],
        sections: {}
    };

    let currentSection = null;

    // Regexes for parsing specific lines
    const acRegex    = /Armor Class\s+(\d+)/i;
    const hpRegex    = /Hit Points\s+(\d+)/i;
    const speedRegex = /Speed\s+([\w\s.,/]+)/i;
    const abilityRegex = /STR\s+(\d+\s+\([+-]\d+\))\s+DEX\s+(\d+\s+\([+-]\d+\))\s+CON\s+(\d+\s+\([+-]\d+\))\s+INT\s+(\d+\s+\([+-]\d+\))\s+WIS\s+(\d+\s+\([+-]\d+\))\s+CHA\s+(\d+\s+\([+-]\d+\))/i;
    const traitRegex = /^(Skills|Senses|Languages|Challenge|Damage Vulnerabilities|Damage Resistances|Damage Immunities|Condition Immunities)\s+([\s\S]+)/i;
    const sectionHeaderRegex = /^(Actions|Reactions|Legendary Actions)$/i;
    const actionRegex = /^\s*([A-Z][\w\s]+)\.\s*/;


    for (const line of lines.slice(2)) {
        if (!line) continue;

        // Top-level stats
        const acMatch = line.match(acRegex);
        if (acMatch) { result.ac = acMatch[1]; continue; }

        const hpMatch = line.match(hpRegex);
        if (hpMatch) { result.hp = hpMatch[1]; continue; }

        const speedMatch = line.match(speedRegex);
        if (speedMatch) { result.speed = speedMatch[1]; continue; }

        // Abilities line
        const abilityMatch = line.match(abilityRegex);
        if (abilityMatch) {
            result.abilities.str = abilityMatch[1];
            result.abilities.dex = abilityMatch[2];
            result.abilities.con = abilityMatch[3];
            result.abilities.int = abilityMatch[4];
            result.abilities.wis = abilityMatch[5];
            result.abilities.cha = abilityMatch[6];
            continue;
        }
        
        // Other traits (Skills, Senses, etc.)
        const traitMatch = line.match(traitRegex);
        if (traitMatch) {
            result.traits.push(`<strong>${traitMatch[1]}</strong> ${traitMatch[2]}`);
            continue;
        }
        
        // Section headers (Actions, etc.)
        const sectionMatch = line.match(sectionHeaderRegex);
        if (sectionMatch) {
            currentSection = sectionMatch[1];
            result.sections[currentSection] = '';
            continue;
        }

        // Content for the current section
        if (currentSection) {
            // Add a bold title for individual actions
            const actionMatch = line.match(actionRegex);
            if (actionMatch && line.length < 100) { // Avoid matching long paragraphs
                 result.sections[currentSection] += `\n<strong><em>${actionMatch[1]}.</em></strong>`;
                 result.sections[currentSection] += line.substring(actionMatch[1].length + 1);
            } else {
                 result.sections[currentSection] += '\n' + line;
            }
        } else if (line.includes('.')) {
             // Assume any other text with a period before the "Actions" section is a trait.
             result.traits.push(line);
        }
    }
    
    // Clean up extra newlines in sections
    for (const key in result.sections) {
        result.sections[key] = result.sections[key].trim();
    }

    return result;
}


// --- Public API ---

/**
 * Parses a string containing a D&D 5e statblock.
 * @param {string} text The raw text.
 * @returns {object|null} A structured object of the parsed data.
 */
export async function importFromText(text) {
    if (!text || typeof text !== 'string') return null;
    return parseStatblockText(text);
}

/**
 * Extracts text from a PDF file and parses it as a D&D 5e statblock.
 * Requires PDF.js to be loaded on the page (window.pdfjsLib).
 * @param {File} file The PDF file object.
 * @returns {object|null} A structured object of the parsed data.
 */
export async function importFromPDF(file) {
    if (!window.pdfjsLib) {
        throw new Error("PDF.js library is not loaded.");
    }
    if (!file) return null;

    const fileReader = new FileReader();
    const promise = new Promise((resolve, reject) => {
        fileReader.onload = async (ev) => {
            try {
                const typedarray = new Uint8Array(ev.target.result);
                const pdf = await window.pdfjsLib.getDocument({ data: typedarray }).promise;
                let fullText = '';
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    // Join items with spaces, and pages with newlines for better parsing
                    fullText += textContent.items.map(item => item.str).join(' ') + '\n';
                }
                resolve(parseStatblockText(fullText));
            } catch (err) {
                reject(err);
            }
        };
        fileReader.onerror = reject;
    });
    fileReader.readAsArrayBuffer(file);
    return promise;
}