(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,68451,e=>{"use strict";let t=(e,t)=>({"zh-CN":{practice_report:"FretMaster 练习报告",generated_at:"生成时间",total_sessions:"总练习次数",total_duration:"总练习时长",average_score:"平均得分",average_accuracy:"平均准确率",exercise_type:"练习类型",score:"得分",duration:"时长(分钟)",accuracy:"准确率",date:"日期",notes:"备注",minutes:"分钟",seconds:"秒",find_note:"找音练习",chord_progression:"和弦进行",scale:"音阶练习",interval:"音程练习",chord_exercise:"和弦练习",rhythm:"节奏练习"},en:{practice_report:"FretMaster Practice Report",generated_at:"Generated At",total_sessions:"Total Sessions",total_duration:"Total Duration",average_score:"Average Score",average_accuracy:"Average Accuracy",exercise_type:"Exercise Type",score:"Score",duration:"Duration(min)",accuracy:"Accuracy",date:"Date",notes:"Notes",minutes:"min",seconds:"sec",find_note:"Find Note",chord_progression:"Chord Progression",scale:"Scale Practice",interval:"Interval Practice",chord_exercise:"Chord Exercise",rhythm:"Rhythm Practice"}})[t]?.[e]||e,r=(e,r)=>({find_note:t("find_note",r),chord_progression:t("chord_progression",r),scale:t("scale",r),interval:t("interval",r),chord_exercise:t("chord_exercise",r),rhythm:t("rhythm",r)})[e]||e;function a(e,a){let{language:o}=a,c=[t("date",o),t("exercise_type",o),t("score",o),t("duration",o),t("accuracy",o),t("notes",o)],i=e.map(e=>[e.created_at||e.date||"",r(e.exercise_type||e.exerciseType||"",o),String(e.score||0),String(Math.round((e.duration||0)/60)),`${e.accuracy||0}%`,(e.notes||"").replace(/"/g,'""')]);return[c.join(","),...i.map(e=>e.map(e=>`"${e}"`).join(","))].join("\n")}function o(e,a){let{language:o,dateRange:c}=a;return JSON.stringify({title:t("practice_report",o),generatedAt:new Date().toISOString(),dateRange:c?{start:c.start.toISOString(),end:c.end.toISOString()}:null,summary:{totalSessions:e.length,totalDuration:e.reduce((e,t)=>e+(t.duration||0),0),averageScore:e.length>0?Math.round(e.reduce((e,t)=>e+(t.score||0),0)/e.length):0,averageAccuracy:e.length>0?Math.round(e.reduce((e,t)=>e+(t.accuracy||0),0)/e.length):0},records:e.map(e=>({date:e.created_at||e.date,exerciseType:e.exercise_type||e.exerciseType,exerciseTypeName:r(e.exercise_type||e.exerciseType||"",o),score:e.score,duration:e.duration,accuracy:e.accuracy,notes:e.notes}))},null,2)}function c(e,a){let{language:o}=a,c=e.reduce((e,t)=>e+(t.duration||0),0),i=e.length>0?Math.round(e.reduce((e,t)=>e+(t.score||0),0)/e.length):0,n=e.length>0?Math.round(e.reduce((e,t)=>e+(t.accuracy||0),0)/e.length):0;return`
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${t("practice_report",o)}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 20px;
      color: #1a1a1a;
    }
    h1 {
      color: #2563eb;
      border-bottom: 2px solid #2563eb;
      padding-bottom: 10px;
    }
    .meta {
      color: #666;
      font-size: 14px;
      margin-bottom: 20px;
    }
    .summary {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin-bottom: 30px;
    }
    .summary-card {
      background: #f8fafc;
      border-radius: 8px;
      padding: 16px;
      text-align: center;
    }
    .summary-card .value {
      font-size: 28px;
      font-weight: bold;
      color: #2563eb;
    }
    .summary-card .label {
      font-size: 12px;
      color: #666;
      margin-top: 4px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }
    th, td {
      border: 1px solid #e5e7eb;
      padding: 12px;
      text-align: left;
    }
    th {
      background: #f8fafc;
      font-weight: 600;
    }
    tr:nth-child(even) {
      background: #f9fafb;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      color: #666;
      font-size: 12px;
    }
    @media print {
      body { padding: 20px; }
      .summary { grid-template-columns: repeat(4, 1fr); }
    }
  </style>
</head>
<body>
  <h1>🎸 ${t("practice_report",o)}</h1>
  <div class="meta">
    ${t("generated_at",o)}: ${new Date().toLocaleString("zh-CN"===o?"zh-CN":"en-US")}
  </div>

  <div class="summary">
    <div class="summary-card">
      <div class="value">${e.length}</div>
      <div class="label">${t("total_sessions",o)}</div>
    </div>
    <div class="summary-card">
      <div class="value">${Math.round(c/60)}</div>
      <div class="label">${t("total_duration",o)}(${t("minutes",o)})</div>
    </div>
    <div class="summary-card">
      <div class="value">${i}</div>
      <div class="label">${t("average_score",o)}</div>
    </div>
    <div class="summary-card">
      <div class="value">${n}%</div>
      <div class="label">${t("average_accuracy",o)}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>${t("date",o)}</th>
        <th>${t("exercise_type",o)}</th>
        <th>${t("score",o)}</th>
        <th>${t("duration",o)}</th>
        <th>${t("accuracy",o)}</th>
      </tr>
    </thead>
    <tbody>
      ${e.map(e=>`
        <tr>
          <td>${e.created_at||e.date||"-"}</td>
          <td>${r(e.exercise_type||e.exerciseType||"",o)}</td>
          <td>${e.score||0}</td>
          <td>${Math.round((e.duration||0)/60)} ${t("minutes",o)}</td>
          <td>${e.accuracy||0}%</td>
        </tr>
      `).join("")}
    </tbody>
  </table>

  <div class="footer">
    Generated by FretMaster \xb7 ${new Date().getFullYear()}
  </div>
</body>
</html>
  `}function i(e,t,r){let a=new Blob([e],{type:r}),o=URL.createObjectURL(a),c=document.createElement("a");c.href=o,c.download=t,document.body.appendChild(c),c.click(),document.body.removeChild(c),URL.revokeObjectURL(o)}function n(e,t){let r,n,d,s=new Date().toISOString().split("T")[0];switch(t.format){case"csv":r=a(e,t),n=`fretmaster-practice-${s}.csv`,d="text/csv;charset=utf-8";break;case"pdf":r=c(e,t),n=`fretmaster-practice-${s}.html`,d="text/html;charset=utf-8";break;case"json":r=o(e,t),n=`fretmaster-practice-${s}.json`,d="application/json;charset=utf-8";break;default:throw Error(`Unsupported format: ${t.format}`)}i(r,n,d)}function d(e,t){let r=c(e,t),a=window.open("","_blank");a&&(a.document.write(r),a.document.close(),a.print())}e.s(["downloadFile",()=>i,"exportPracticeData",()=>n,"exportToCSV",()=>a,"exportToJSON",()=>o,"generatePDFContent",()=>c,"printPDFReport",()=>d])}]);