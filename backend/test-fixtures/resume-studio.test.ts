import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { ZodError } from "zod";
import mammoth from "mammoth";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { importResumeText } from "../src/services/resume-import";
import { renderResumePdf, renderResumeDocx, fitResumeToOnePage } from "../src/services/resume-renderer";

process.env.MONGODB_URI = "mongodb://127.0.0.1/resume-studio-test";
process.env.JWT_ACCESS_SECRET = "resume-studio-test-access-00000000000000";
process.env.JWT_REFRESH_SECRET = "resume-studio-test-refresh-0000000000000";
process.env.GEMINI_API_KEY = "";
process.env.OPENAI_API_KEY = "";
process.env.SARVAM_API_KEY = "";
const { resumeRouter } = await import("../src/routes/resume");
const { Resume } = await import("../src/models/Resume");
const { User } = await import("../src/models/User");
const { Institution } = await import("../src/models/Institution");
const { signAccessToken } = await import("../src/services/token-service");

const source = `Aisha Morgan\naisha@example.com\n+91 98765 43210\nPROFILE\nDesigner working with web interfaces.\nEDUCATION\nBachelor of Design\nDesign School\n2022\nPROJECTS\nWayfinding\nA project with twelve detailed source lines.\n${Array.from({ length: 12 }, (_, i) => `Detail ${i + 1}: a fact that must survive import.`).join("\n")}\nSKILLS\nFigma, Research\nLANGUAGES\nEnglish, Hindi`;

test("imports retain contact details, extra section types, and all original lines", () => {
  const parsed = importResumeText(source);
  assert.equal(parsed.personalDetails.fullName, "Aisha Morgan");
  assert.equal(parsed.personalDetails.email, "aisha@example.com");
  assert.ok(parsed.personalDetails.phone.includes("98765"));
  assert.ok(parsed.sections.some(s => s.type === "languages"));
  assert.ok(JSON.stringify(parsed.sections).includes("Detail 12"));
  assert.ok(!JSON.stringify(parsed.sections.find(s => s.type === "summary")).includes("aisha@example.com"));
  assert.equal(parsed.sections.find(s => s.type === "education")?.content.entries?.[0]?.degree, "Bachelor of Design");
  assert.equal(parsed.sections.find(s => s.type === "projects")?.content.entries?.[0]?.title, "Wayfinding");
});

test("PDF and DOCX exports contain current personal details and omit hidden sections", async () => {
  const parsed = importResumeText(source);
  const sections = [...parsed.sections, { type: "awards" as const, order: 20, content: { hidden: true, text: "PRIVATE_HIDDEN_AWARD" } }];
  const options = { template: "modern", personalDetails: { ...parsed.personalDetails, fullName: "Edited Candidate", location: "Pune, India", professionalTitle: "Product Designer" }, design: { accent: "#4a675b", font: "serif" as const, pageSize: "LETTER" as const } };
  const pdf = await renderResumePdf("Account Name", "My application", sections, options);
  assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
  const text = await pdfParse(pdf, { version: "v2.0.550" });
  assert.ok(text.text.replace(/\s+/g, " ").includes("Edited Candidate"));
  assert.ok(text.text.includes("Pune, India"));
  assert.ok(text.text.includes("Detail 12"));
  assert.ok(!text.text.includes("PRIVATE_HIDDEN_AWARD"));
  const docx = await renderResumeDocx("Account Name", "My application", sections, options);
  assert.equal(docx.subarray(0, 2).toString(), "PK");
  const word = await mammoth.extractRawText({ buffer: docx });
  assert.ok(word.value.includes("Edited Candidate"));
  assert.ok(word.value.includes("Detail 12"));
  assert.ok(!word.value.includes("PRIVATE_HIDDEN_AWARD"));
});

test("long PDF resumes paginate without losing the final entry", async () => {
  const sections = [{ type: "experience" as const, order: 0, content: { entries: Array.from({ length: 30 }, (_, i) => ({ title: `Position ${i + 1}`, bullets: ["A detailed contribution with measurable context supplied by the candidate.", "An additional responsibility preserved in the exported document."] })) } }];
  const pdf = await renderResumePdf("Test Candidate", "Long resume", sections, { template: "modern", design: { onePage: false } });
  const parsed = await pdfParse(pdf);
  assert.ok(parsed.numpages > 1);
  assert.ok(parsed.text.includes("Position 30"));
  await assert.rejects(() => renderResumePdf("Test Candidate", "Student resume", sections), /Shorten descriptions/);
});

test("student resume fits one page without dropping the final entry", async () => {
  const sections = [{ type: "projects" as const, order: 0, content: { entries: Array.from({ length: 9 }, (_, i) => ({ title: `Project ${i + 1}`, date: "2025-06", detail: "Designed and delivered a useful application with careful attention to reliability and user experience." })) } }];
  const fitted = await fitResumeToOnePage("Student Candidate", "Student resume", sections, { design: { fontSize: 13, margin: 65, lineHeight: 1.9, entrySpacing: 12, dateFormat: "long", datePosition: "right", footerText: "Portfolio available", pageNumbers: true } });
  const parsed = await pdfParse(fitted.buffer, { version: "v2.0.550" });
  assert.equal(parsed.numpages, 1);
  assert.ok(parsed.text.includes("Project 9"));
  assert.ok(parsed.text.includes("June 2025"));
  assert.ok(parsed.text.includes("Portfolio available"));
  assert.ok(fitted.design.fontSize >= 9);
  assert.ok(fitted.design.fontSize < 13);
});

test("blank drafts, designs, versions, and imported details persist through the authenticated API", async () => {
  const db = await MongoMemoryServer.create();
  await mongoose.connect(db.getUri());
  const institution = await Institution.create({ name: "Resume QA Institute", slug: "resume-qa", status: "active" });
  const user = await User.create({ name: "Test Candidate", email: "candidate@example.com", role: "student", status: "active", institutionId: institution._id, studentVerificationStatus: "approved" });
  const app = express(); app.use(express.json()); app.use("/resume", resumeRouter);
  app.use(((error, _req, res, _next) => { res.status(error instanceof ZodError ? 400 : 500).json({ message: error.message }); }) as express.ErrorRequestHandler);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.on("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as { port:number }).port}`;
  const token = signAccessToken(user);
  const request = async (path:string, method="GET", body?:unknown) => {
    const response = await fetch(base + path, { method, headers:{ Authorization:`Bearer ${token}`, "Content-Type":"application/json" }, body:body === undefined ? undefined : JSON.stringify(body) });
    return { status:response.status, data:await response.json() };
  };
  try {
    const created = await request("/resume/draft", "POST", { template:"modern", design:{ accent:"#4a675b" } });
    assert.equal(created.status,201); assert.deepEqual(created.data.resume.sections,[]);
    assert.equal(created.data.resume.personalDetails.email,user.email);
    assert.equal((await request("/resume/versions","POST",{})).status,201);
    const settings = { title:"Edited resume", template:"modern", sections:importResumeText(source).sections, personalDetails:{fullName:"Edited Name",email:"edited@example.com",location:"Pune, India"}, design:{accent:"#4a675b",font:"serif",margin:35,pageSize:"LETTER"} };
    const patched=await request("/resume/current","PATCH",settings);
    assert.equal(patched.status,200);
    assert.equal(patched.data.resume.design.accent,"#4a675b");
    const version=await request("/resume/versions","POST",{});
    assert.equal(version.status,201);
    assert.equal(version.data.resume.personalDetails.fullName,"Edited Name");
    assert.equal(version.data.resume.design.pageSize,"LETTER");
      const fitted = await request("/resume/fit", "POST", {});
      assert.equal(fitted.status, 200);
      assert.equal(fitted.data.pages, 1);
      assert.equal(fitted.data.resume.design.onePage, true);
      assert.deepEqual(fitted.data.resume.sections, version.data.resume.sections);
    const restored=await request(`/resume/versions/${created.data.resume._id}/restore`,"POST",{});
    assert.equal(restored.status,201); assert.deepEqual(restored.data.resume.sections,[]);
    assert.equal(await Resume.countDocuments({studentId:user._id,isCurrent:true}),1);
    assert.equal((await request("/resume/current","PATCH",{...settings,design:{accent:"not-a-color"}})).status,400);
    const uploadFile = await renderResumeDocx("Uploaded Candidate", "Upload example", importResumeText(source).sections, { personalDetails:{email:"upload@example.com"} });
    const form = new FormData(); form.append("resume",new Blob([new Uint8Array(uploadFile)]),"existing-resume.docx");
    const uploaded = await fetch(base+"/resume/upload",{method:"POST",headers:{Authorization:`Bearer ${token}`},body:form});
    assert.equal(uploaded.status,202);
    const uploadJob = (await uploaded.json()).job.id;
    let imported;
    for(let attempt=0;attempt<50;attempt++){
      await new Promise(resolve=>setTimeout(resolve,100));
      const polled=await request(`/resume/jobs/${uploadJob}`);
      if(polled.data.job.status==="failed")throw Error(polled.data.job.error);
      if(polled.data.job.status==="complete"){imported=polled.data.job.result.resume;break;}
    }
    assert.equal(imported?.title,"existing-resume");
    assert.equal(imported?.personalDetails.email,"upload@example.com");
    assert.ok(JSON.stringify(imported?.sections).includes("Detail 12"));
  } finally {
    await new Promise<void>(resolve => server.close(()=>resolve()));
    await new Promise(resolve => setTimeout(resolve,300));
    await mongoose.disconnect(); await db.stop();
  }
});
