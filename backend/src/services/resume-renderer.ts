import PDFDocument from "pdfkit";
import { BorderStyle, Document, Footer, HeadingLevel, ImageRun, Packer, PageNumber, Paragraph, TabStopType, TextRun } from "docx";
import type { ResumeSection } from "./resume-service";
import { personalDetailsSchema, resumeDesignSchema, type ResumeDesign, type ResumeRenderOptions } from "./resume-settings";
import { formatResumeDate, resumeContacts } from "./resume-formatting";

const labels: Record<string, string> = { summary: "Profile", experience: "Professional experience", education: "Education", skills: "Skills", projects: "Projects", certifications: "Certifications", languages: "Languages", interests: "Interests", courses: "Courses", awards: "Awards", organizations: "Organizations", publications: "Publications", references: "References", declaration: "Declaration", custom: "Additional information" };
const visible = (sections: ResumeSection[]) => [...sections].filter(s => !s.content.hidden).sort((a,b) => a.order-b.order);
const heading = (s: ResumeSection, d: ResumeDesign) => d.headingCase === "uppercase" ? String(s.content.heading || labels[s.type]).toUpperCase() : String(s.content.heading || labels[s.type]);
function lines(section: ResumeSection, design: ResumeDesign): Array<{ text: string; bold?: boolean; bullet?: boolean; date?: string }> {
  const result: Array<{ text: string; bold?: boolean; bullet?: boolean; date?: string }> = [];
  if (section.content.text) result.push({ text: String(section.content.text) });
  if (Array.isArray(section.content.items)) result.push({ text: section.content.items.filter(Boolean).join("  ·  ") });
  for (const entry of (Array.isArray(section.content.entries) ? section.content.entries : []) as Array<Record<string,unknown>>) {
    if (entry.title || entry.degree) result.push({ text: String(entry.title || entry.degree), bold: design.boldEntries });
    const organization = entry.subtitle === "Imported from your resume" ? "" : entry.subtitle || entry.institution;
    const date = design.showDates ? formatResumeDate(entry.date || entry.graduationYear, design) : "";
    const text = [organization, entry.location, ...(design.datePosition === "inline" ? [date] : [])].filter(Boolean).join(" · ");
    if (text || date) result.push({ text, date: design.datePosition === "right" ? date : undefined });
    if (entry.detail) result.push({ text: String(entry.detail) });
    if (Array.isArray(entry.bullets)) for (const bullet of entry.bullets) if (String(bullet).trim()) result.push({ text: String(bullet).replace(/^[•-]\s*/, ""), bullet: true });
  }
  return result.filter(line => line.text || line.date);
}
function sidebarFor(template: string | undefined, design: ResumeDesign) {
  return design.layout === "auto" ? template === "modern" : design.layout.startsWith("sidebar");
}
async function renderPdf(name: string, title: string, sections: ResumeSection[], options: ResumeRenderOptions, design: ResumeDesign): Promise<{ buffer:Buffer; pages:number }> {
  const person = personalDetailsSchema.parse({ fullName: name, ...options.personalDetails });
  const sidebar = sidebarFor(options.template, design);
  const right = design.layout === "sidebar-right";
  const margin = design.margin;
  return new Promise((resolve,reject) => {
    const doc = new PDFDocument({ size:design.pageSize, compress:false, bufferPages:true, margins:{ top:margin,bottom:margin,left:sidebar&&!right?design.sidebarWidth+28:margin,right:sidebar&&right?design.sidebarWidth+28:margin },info:{Title:title,Author:person.fullName||name} });
    const chunks:Buffer[]=[];let pages=1;
    doc.on("data",chunk=>chunks.push(Buffer.from(chunk)));
    doc.on("end",()=>resolve({buffer:Buffer.concat(chunks),pages}));
    doc.on("error",reject);
    const normal=design.font==="serif"?"Times-Roman":design.font==="mono"?"Courier":"Helvetica";
    const bold=design.font==="serif"?"Times-Bold":design.font==="mono"?"Courier-Bold":"Helvetica-Bold";
    const x=sidebar&&!right?design.sidebarWidth+28:margin;
    const width=doc.page.width-x-(sidebar&&right?design.sidebarWidth+28:margin);
    const fontSize=design.fontSize;
    const lineGap=Math.max(0,fontSize*(design.lineHeight-1)*.65);
    const decorate=()=>{ if(sidebar)doc.save().rect(right?doc.page.width-design.sidebarWidth:0,0,design.sidebarWidth,doc.page.height).fill(design.accent).restore();doc.x=x;doc.y=margin; };
    decorate();doc.on("pageAdded",()=>{pages++;decorate();});
    const contacts=resumeContacts(person,design);
    const separator=design.contactSeparator==="bar"?"  |  ":"  ·  ";
    const photo=person.photo&&design.showPhoto?Buffer.from(person.photo.split(",")[1],"base64"):null;
    const drawPhoto=(px:number,py:number)=>{
      if(!photo)return;
      doc.save();
      if(design.photoShape==="round")doc.circle(px+design.photoSize/2,py+design.photoSize/2,design.photoSize/2).clip();
      doc.image(photo,px,py,{fit:[design.photoSize,design.photoSize]});doc.restore();
    };
    if(sidebar){
      const sx=right?doc.page.width-design.sidebarWidth+20:20,sw=design.sidebarWidth-40;
      let sy=margin;
      if(photo){drawPhoto(sx,sy);sy+=design.photoSize+16;}
      doc.fillColor("#FFFFFF").font(bold).fontSize(design.nameSize).text(person.fullName||name,sx,sy,{width:sw,lineGap:2});
      if(person.professionalTitle)doc.font(normal).fontSize(10).text(person.professionalTitle,{width:sw,lineGap:2});
      doc.moveDown(1);
      for(const item of contacts){doc.fillColor("#FFFFFF").font(normal).fontSize(8.5).text(item,{width:sw,lineGap:2,underline:design.linkStyle==="underline"&&[person.linkedin,person.website].includes(item)});doc.moveDown(.5);}
      doc.x=x;doc.y=margin;
    }else{
      const nameWidth=photo?width-design.photoSize-15:width;
      if(photo)drawPhoto(x+width-design.photoSize,margin);
      doc.fillColor(design.accent).font(bold).fontSize(design.nameSize).text(person.fullName||name,x,margin,{width:nameWidth,align:design.headerAlign});
      if(person.professionalTitle)doc.fillColor(design.textColor).font(normal).fontSize(11).text(person.professionalTitle,{width:nameWidth,align:design.headerAlign});
      if(contacts.length){
        doc.moveDown(.35).font(normal).fontSize(8.5).fillColor(design.textColor);
        contacts.forEach((item,index)=>doc.text(item+(index<contacts.length-1&&design.contactSeparator!=="stacked"?separator:""),{width:nameWidth,align:design.headerAlign,lineGap:2,continued:index<contacts.length-1&&design.contactSeparator!=="stacked",underline:design.linkStyle==="underline"&&[person.linkedin,person.website].includes(item)}));
      }
      if(photo)doc.y=Math.max(doc.y,margin+design.photoSize);
      doc.y+=design.headerSpacing;
    }
    for(const section of visible(sections)){
      const content=lines(section,design);if(!content.length)continue;
      if(doc.y>doc.page.height-margin-45)doc.addPage();
      if(design.sectionStyle==="band")doc.save().rect(x,doc.y-2,width,design.headingSize+8).fill("#F0F2F5").restore();
      doc.font(bold).fontSize(design.headingSize).fillColor(design.headingColor).text(heading(section,design),x,doc.y,{width,characterSpacing:.5,lineGap:1});
      if(design.sectionStyle==="rule")doc.save().moveTo(x,doc.y+2).lineTo(x+width,doc.y+2).strokeColor(design.headingColor).lineWidth(.5).stroke().restore();
      doc.y+=5;
      for(const line of content){
        const y=doc.y;
        const prefix=line.bullet?(design.bulletStyle==="dash"?"– ":"• "):"";
        doc.font(line.bold?bold:normal).fontSize(fontSize).fillColor(design.textColor).text(prefix+line.text,x,y,{width:line.date?Math.max(80,width-115):width,lineGap});
        if(line.date){const bottom=doc.y;doc.font(normal).fontSize(Math.max(8,fontSize-.5)).text(line.date,x+width-110,y,{width:110,align:"right"});doc.y=Math.max(bottom,doc.y);doc.x=x;}
        doc.y+=design.entrySpacing;
      }
      doc.y+=design.sectionSpacing;
    }
    if(design.footerText||design.pageNumbers){
      const range=doc.bufferedPageRange();
      for(let i=0;i<range.count;i++){doc.switchToPage(i);const y=doc.y,bottom=doc.page.margins.bottom;doc.page.margins.bottom=0;doc.font(normal).fontSize(8).fillColor(design.textColor).text([design.footerText,design.pageNumbers?String(i+1):""].filter(Boolean).join(" · "),x,doc.page.height-24,{width,align:"center",lineBreak:false});doc.page.margins.bottom=bottom;doc.y=y;}
    }
    doc.end();
  });
}
export async function fitResumeToOnePage(name:string,title:string,sections:ResumeSection[],options:ResumeRenderOptions={}) {
  const original=resumeDesignSchema.parse(options.design||{});
  for(let step=0;step<=12;step++){
    const ratio=step/12;
    const design:ResumeDesign={...original,onePage:true,margin:Math.max(28,original.margin-(original.margin-28)*ratio),fontSize:Math.max(9,original.fontSize-(original.fontSize-9)*ratio),lineHeight:Math.max(1.15,original.lineHeight-(original.lineHeight-1.15)*ratio),sectionSpacing:Math.max(6,original.sectionSpacing-(original.sectionSpacing-6)*ratio),entrySpacing:Math.max(1,original.entrySpacing-(original.entrySpacing-1)*ratio),headerSpacing:Math.max(8,original.headerSpacing-(original.headerSpacing-8)*ratio),headingSize:Math.max(10,original.headingSize-(original.headingSize-10)*ratio),nameSize:Math.max(18,original.nameSize-(original.nameSize-18)*ratio)};
    for(const key of ["margin","fontSize","lineHeight","sectionSpacing","entrySpacing","headerSpacing","headingSize","nameSize"] as const)design[key]=Math.round(design[key]*100)/100;
    const result=await renderPdf(name,title,sections,options,design);
    if(result.pages===1)return{...result,design};
  }
  throw new Error("This resume still needs more than one page at readable settings. Shorten descriptions or hide less relevant sections, then choose Fit to one page again. No content has been removed.");
}
export async function renderResumePdf(name:string,title:string,sections:ResumeSection[],options:ResumeRenderOptions={}) {
  const design=resumeDesignSchema.parse(options.design||{});
  return design.onePage?(await fitResumeToOnePage(name,title,sections,options)).buffer:(await renderPdf(name,title,sections,options,design)).buffer;
}
export async function renderResumeDocx(name:string,title:string,sections:ResumeSection[],options:ResumeRenderOptions={}) {
  const person=personalDetailsSchema.parse({fullName:name,...options.personalDetails});
  const design=resumeDesignSchema.parse(options.design||{});
  const font=design.font==="serif"?"Times New Roman":design.font==="mono"?"Courier New":"Arial";
  const alignment=design.headerAlign;
  const children:Paragraph[]=[];
  if(person.photo&&design.showPhoto)children.push(new Paragraph({alignment,children:[new ImageRun({type:person.photo.startsWith("data:image/png")?"png":"jpg",data:Buffer.from(person.photo.split(",")[1],"base64"),transformation:{width:design.photoSize,height:design.photoSize}})],spacing:{after:100}}));
  children.push(new Paragraph({alignment,children:[new TextRun({text:person.fullName||name,bold:true,size:design.nameSize*2,color:design.accent.slice(1)})]}));
  if(person.professionalTitle)children.push(new Paragraph({text:person.professionalTitle,alignment,spacing:{after:60}}));
  const contacts=resumeContacts(person,design).join(design.contactSeparator==="bar"?" | ":design.contactSeparator==="stacked"?"\n":" · ");
  if(contacts)children.push(new Paragraph({alignment,children:resumeContacts(person,design).map((text,index)=>new TextRun({text:(index?(design.contactSeparator==="bar"?" | ":design.contactSeparator==="stacked"?"":" · "):"")+text,break:index&&design.contactSeparator==="stacked"?1:undefined,underline:design.linkStyle==="underline"&&[person.linkedin,person.website].includes(text)?{}:undefined})),spacing:{after:design.headerSpacing*20}}));
  for(const section of visible(sections)){
    const content=lines(section,design);if(!content.length)continue;
    children.push(new Paragraph({heading:HeadingLevel.HEADING_1,children:[new TextRun({text:heading(section,design),bold:true,color:design.headingColor.slice(1),size:design.headingSize*2})],border:design.sectionStyle==="rule"?{bottom:{style:BorderStyle.SINGLE,color:design.headingColor.slice(1),size:4}}:undefined,shading:design.sectionStyle==="band"?{fill:"F0F2F5"}:undefined,spacing:{before:design.sectionSpacing*20,after:60},keepNext:true}));
    for(const line of content)children.push(new Paragraph({children:[new TextRun({text:[line.bullet&&design.bulletStyle==="dash"?"–":null,line.text].filter(Boolean).join(" ")+(line.date?"\t"+line.date:""),bold:line.bold})],tabStops:line.date?[{type:TabStopType.RIGHT,position:(design.pageSize==="A4"?11906:12240)-design.margin*40}]:undefined,bullet:line.bullet&&design.bulletStyle==="disc"?{level:0}:undefined,spacing:{after:design.entrySpacing*20,line:Math.round(240*design.lineHeight)}}));
  }
  const footer=design.footerText||design.pageNumbers?new Footer({children:[new Paragraph({alignment:"center",children:[new TextRun({text:design.footerText,size:16}),...(design.pageNumbers?[new TextRun({children:[" ",PageNumber.CURRENT],size:16})]:[])]})]}):undefined;
  return Buffer.from(await Packer.toBuffer(new Document({title,creator:person.fullName||name,styles:{default:{document:{run:{font,size:design.fontSize*2,color:design.textColor.slice(1)}}}},sections:[{properties:{page:{size:{width:design.pageSize==="A4"?11906:12240,height:design.pageSize==="A4"?16838:15840},margin:{top:design.margin*20,right:design.margin*20,bottom:design.margin*20,left:design.margin*20}}},footers:footer?{default:footer}:undefined,children}]})));
}
