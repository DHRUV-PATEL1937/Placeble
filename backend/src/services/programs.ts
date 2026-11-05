/**
 * The built-in starting list of programmes. On first run these are copied into the database, where the
 * superadmin manages them (add, edit, switch off). Editing this file later does not change existing programmes.
 * Nobody types a branch name: institutes enable programmes from the list, and B2C students pick one.
 *
 * `interviewStyle` drives which practice tools and recommendations a student sees first:
 *   technical = coding / aptitude heavy, business = communication and HR heavy, mixed = a blend.
 */
export type InterviewStyle = "technical" | "business" | "mixed";
export type Program = { code: string; name: string; category: string; durationYears: number; interviewStyle: InterviewStyle; roles: string[]; coding: boolean };

const RAW: Array<Omit<Program, "coding">> = [
  { code: "BCA", name: "BCA", category: "Computer applications", durationYears: 3, interviewStyle: "technical", roles: ["Software Developer", "Web Developer", "Frontend Developer", "Backend Developer", "QA / Test Engineer", "Technical Support Engineer", "Data Analyst", "System Administrator"] },
  { code: "MCA", name: "MCA", category: "Computer applications", durationYears: 2, interviewStyle: "technical", roles: ["Software Engineer", "Full-Stack Developer", "Backend Developer", "Data Analyst", "Data Engineer", "Cloud / DevOps Engineer", "Mobile App Developer", "Business Analyst"] },
  { code: "BSCIT", name: "BSc IT", category: "Computer applications", durationYears: 3, interviewStyle: "technical", roles: ["Software Developer", "Web Developer", "Network Engineer", "QA / Test Engineer", "Technical Support Engineer", "Data Analyst", "Database Administrator", "System Administrator"] },
  { code: "MSCIT", name: "MSc IT", category: "Computer applications", durationYears: 2, interviewStyle: "technical", roles: ["Software Engineer", "Data Analyst", "Data Scientist", "Cloud / DevOps Engineer", "Cybersecurity Analyst", "Full-Stack Developer", "Business Analyst", "Systems Engineer"] },
  { code: "BTECH_CSE", name: "B.Tech Computer Science / IT", category: "Engineering", durationYears: 4, interviewStyle: "technical", roles: ["Software Engineer", "Full-Stack Developer", "Data Scientist", "Machine Learning Engineer", "Cloud / DevOps Engineer", "Cybersecurity Analyst", "Mobile App Developer", "QA / Test Engineer"] },
  { code: "BTECH_ECE", name: "B.Tech Electronics & Communication", category: "Engineering", durationYears: 4, interviewStyle: "technical", roles: ["Embedded Systems Engineer", "VLSI Engineer", "Network Engineer", "Hardware Engineer", "Software Engineer", "Test Engineer", "IoT Engineer"] },
  { code: "BTECH_ME", name: "B.Tech Mechanical", category: "Engineering", durationYears: 4, interviewStyle: "technical", roles: ["Design Engineer", "Production Engineer", "Quality Engineer", "Maintenance Engineer", "CAD / CAM Engineer", "Project Engineer", "Graduate Engineer Trainee"] },
  { code: "BTECH_CE", name: "B.Tech Civil", category: "Engineering", durationYears: 4, interviewStyle: "technical", roles: ["Site Engineer", "Structural Engineer", "Planning Engineer", "Quantity Surveyor", "Project Engineer", "Graduate Engineer Trainee"] },
  { code: "BTECH_EE", name: "B.Tech Electrical", category: "Engineering", durationYears: 4, interviewStyle: "technical", roles: ["Electrical Engineer", "Power Systems Engineer", "Automation Engineer", "Maintenance Engineer", "Project Engineer", "Graduate Engineer Trainee"] },
  { code: "MBA", name: "MBA", category: "Management", durationYears: 2, interviewStyle: "business", roles: ["HR Executive", "Marketing Executive", "Business Development Executive", "Financial Analyst", "Operations Executive", "Business Analyst", "Sales Manager Trainee", "Management Trainee"] },
  { code: "BBA", name: "BBA", category: "Management", durationYears: 3, interviewStyle: "business", roles: ["HR Executive", "Marketing Executive", "Business Development Executive", "Sales Executive", "Operations Executive", "Customer Success Executive", "Management Trainee"] },
  { code: "BCOM", name: "B.Com", category: "Commerce", durationYears: 3, interviewStyle: "business", roles: ["Accounts Executive", "Financial Analyst", "Audit Associate", "Tax Associate", "Banking Associate", "Operations Executive", "Customer Support Executive"] },
  { code: "MCOM", name: "M.Com", category: "Commerce", durationYears: 2, interviewStyle: "business", roles: ["Financial Analyst", "Accountant", "Audit Associate", "Tax Consultant", "Banking Officer", "Investment Analyst"] },
  { code: "BSC", name: "B.Sc (Science)", category: "Science", durationYears: 3, interviewStyle: "mixed", roles: ["Research Assistant", "Lab Analyst", "Quality Analyst", "Data Analyst", "Technical Writer", "Teaching Associate", "Production Chemist"] },
  { code: "MSC", name: "M.Sc (Science)", category: "Science", durationYears: 2, interviewStyle: "mixed", roles: ["Research Associate", "Data Analyst", "Quality Analyst", "Lab Scientist", "Technical Writer", "Lecturer"] },
  { code: "BPHARM", name: "B.Pharm", category: "Pharmacy", durationYears: 4, interviewStyle: "mixed", roles: ["Pharmacist", "Quality Control Analyst", "Production Executive", "Medical Representative", "Regulatory Affairs Associate", "Clinical Research Associate"] },
  { code: "BA", name: "BA", category: "Arts & humanities", durationYears: 3, interviewStyle: "business", roles: ["Content Writer", "HR Executive", "Customer Success Executive", "Teaching Associate", "Marketing Executive", "Public Relations Executive"] },
];

/** Programmes that get the Coding practice tool by default. The superadmin can change this per programme. */
const CODING = new Set(["BCA", "MCA", "BSCIT", "MSCIT", "BTECH_CSE", "BTECH_ECE"]);
export const DEFAULT_PROGRAMS: Program[] = RAW.map(program => ({ ...program, coding: CODING.has(program.code) }));
