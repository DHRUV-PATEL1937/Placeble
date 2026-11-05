/** Suggestions for the goals and skills boxes. Students can still type anything that isn't listed. */
export type CatalogProgram = { code?: string; name?: string; category?: string; interviewStyle?: string; roles?: string[] } | null | undefined;

const GENERAL_SKILLS = ["Communication", "Teamwork", "Problem solving", "Time management", "Leadership", "Critical thinking", "Presentation skills", "MS Excel", "MS Word", "MS PowerPoint", "Public speaking", "Adaptability", "Research", "Report writing"];

const SKILLS_BY_CATEGORY: Record<string, string[]> = {
  "Computer applications": ["Python", "Java", "JavaScript", "TypeScript", "C", "C++", "C#", "HTML", "CSS", "React", "Angular", "Vue.js", "Node.js", "Express.js", "PHP", "Laravel", "Django", "Flask", "Spring Boot", "SQL", "MySQL", "PostgreSQL", "MongoDB", "Firebase", "Git", "GitHub", "REST APIs", "GraphQL", "Data structures", "Algorithms", "Object-oriented programming", "Operating systems", "Computer networks", "DBMS", "Linux", "Docker", "AWS", "Azure", "CI/CD", "Android development", "Flutter", "Kotlin", "Swift", "Machine learning", "Deep learning", "Pandas", "NumPy", "Power BI", "Tableau", "Cyber security", "Software testing", "Selenium", "UI/UX design", "Figma", "Tailwind CSS", "Next.js", "Redux", "Agile", "Scrum"],
  Engineering: ["AutoCAD", "SolidWorks", "CATIA", "ANSYS", "MATLAB", "Python", "C", "C++", "Embedded C", "Arduino", "Raspberry Pi", "PLC programming", "SCADA", "VLSI design", "Verilog", "Circuit design", "PCB design", "Signal processing", "IoT", "STAAD Pro", "Revit", "Primavera", "Surveying", "Structural analysis", "Thermodynamics", "Fluid mechanics", "CAD/CAM", "Quality control", "Six Sigma", "Lean manufacturing", "Project planning", "Machine learning", "Data structures", "Algorithms", "SQL"],
  Management: ["Business analysis", "Market research", "Digital marketing", "SEO", "Social media marketing", "Sales", "Negotiation", "CRM", "Salesforce", "Financial analysis", "Financial modelling", "Budgeting", "Accounting basics", "Operations management", "Supply chain management", "Human resources", "Recruitment", "Payroll", "Performance management", "Project management", "Stakeholder management", "Business communication", "Power BI", "Tableau", "SQL", "Google Analytics", "Content marketing", "Brand management", "Customer service", "Event management"],
  Commerce: ["Tally", "GST", "Income tax", "TDS", "Accounting", "Bookkeeping", "Auditing", "Financial reporting", "Financial analysis", "Taxation", "Banking operations", "Costing", "Budgeting", "Bank reconciliation", "MS Excel", "Advanced Excel", "SAP FICO", "QuickBooks", "Investment analysis", "Equity research", "Business law", "Data entry", "Power BI", "SQL"],
  Science: ["Laboratory techniques", "Data analysis", "Statistics", "R", "Python", "MATLAB", "SPSS", "Research writing", "Literature review", "Experiment design", "Chromatography", "Spectroscopy", "Microscopy", "Quality assurance", "Technical writing", "Scientific reporting", "MS Excel", "SQL", "Data visualisation", "GLP"],
  Pharmacy: ["GMP", "GLP", "Pharmacovigilance", "Quality control", "Quality assurance", "Regulatory affairs", "Clinical research", "HPLC", "Dispensing", "Pharmacology", "Formulation", "Drug safety", "Documentation", "Inventory management", "Medical sales", "Pharmaceutical analysis"],
  "Arts & humanities": ["Content writing", "Copywriting", "Editing", "Proofreading", "Creative writing", "Social media management", "Public speaking", "Research", "Teaching", "Translation", "Journalism", "Public relations", "Canva", "Video editing", "Photography", "SEO writing", "Event coordination", "Customer service", "Counselling"],
};

const COMMON_TECH_SKILLS = SKILLS_BY_CATEGORY["Computer applications"];

const ROLES_BY_CATEGORY: Record<string, string[]> = {
  "Computer applications": ["Software Engineer", "Software Developer", "Frontend Developer", "Backend Developer", "Full-Stack Developer", "Web Developer", "Mobile App Developer", "Android Developer", "Data Analyst", "Data Scientist", "Data Engineer", "Machine Learning Engineer", "DevOps Engineer", "Cloud Engineer", "QA / Test Engineer", "Cybersecurity Analyst", "UI/UX Designer", "Technical Support Engineer", "Business Analyst", "Product Analyst", "Database Administrator", "Systems Engineer"],
  Engineering: ["Graduate Engineer Trainee", "Design Engineer", "Production Engineer", "Quality Engineer", "Maintenance Engineer", "Project Engineer", "Site Engineer", "Embedded Systems Engineer", "Electrical Engineer", "Automation Engineer", "Software Engineer", "Technical Sales Engineer", "Process Engineer", "Service Engineer"],
  Management: ["Management Trainee", "HR Executive", "Marketing Executive", "Business Development Executive", "Sales Executive", "Operations Executive", "Financial Analyst", "Business Analyst", "Product Manager (Associate)", "Digital Marketing Executive", "Customer Success Executive", "Supply Chain Analyst", "Account Manager", "Recruiter"],
  Commerce: ["Accounts Executive", "Financial Analyst", "Audit Associate", "Tax Associate", "Banking Associate", "Investment Analyst", "Accountant", "Credit Analyst", "Operations Executive", "Equity Research Analyst", "Finance Executive", "Business Analyst"],
  Science: ["Research Assistant", "Lab Analyst", "Quality Analyst", "Data Analyst", "Technical Writer", "Teaching Associate", "Research Associate", "Production Chemist", "Quality Control Chemist"],
  Pharmacy: ["Pharmacist", "Quality Control Analyst", "Production Executive", "Medical Representative", "Regulatory Affairs Associate", "Clinical Research Associate", "Pharmacovigilance Associate", "Formulation Scientist"],
  "Arts & humanities": ["Content Writer", "Copywriter", "HR Executive", "Customer Success Executive", "Teaching Associate", "Marketing Executive", "Public Relations Associate", "Social Media Executive", "Editor", "Journalist", "Counsellor"],
};
const GENERAL_ROLES = ["Business Analyst", "Customer Support Executive", "Operations Executive", "Project Coordinator", "Management Trainee", "Data Entry Operator", "Administrative Executive"];

const unique = (items: string[]) => {
  const seen = new Set<string>();
  return items.filter(item => { const key = item.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; });
};

/** Best matches first: roles the programme lists, then its field, then general ones. */
export function roleSuggestions(program: CatalogProgram) {
  const field = (program?.category && ROLES_BY_CATEGORY[program.category]) || [];
  return unique([...(program?.roles ?? []), ...field, ...GENERAL_ROLES]);
}

export function skillSuggestions(program: CatalogProgram) {
  const field = (program?.category && SKILLS_BY_CATEGORY[program.category]) || (program ? [] : COMMON_TECH_SKILLS);
  return unique([...field, ...GENERAL_SKILLS]);
}

/** Everything we know about, used when a student has no programme chosen yet. */
export const allSkills = () => unique([...Object.values(SKILLS_BY_CATEGORY).flat(), ...GENERAL_SKILLS]);
export const allRoles = () => unique([...Object.values(ROLES_BY_CATEGORY).flat(), ...GENERAL_ROLES]);

/** Find the programme by its name (what a student profile stores) so suggestions fit their course. */
export function findProgram<T extends { name: string; code: string }>(programs: T[], text: string | undefined | null) {
  const value = (text ?? "").trim().toLowerCase();
  if (!value) return undefined;
  return programs.find(program => program.code.toLowerCase() === value || program.name.toLowerCase() === value)
    ?? programs.find(program => value.includes(program.name.toLowerCase()) || program.name.toLowerCase().includes(value));
}
