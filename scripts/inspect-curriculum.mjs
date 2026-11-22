import fs from "node:fs";
const catalog = JSON.parse(fs.readFileSync("data/curriculum/curriculum-catalog.json", "utf8"));
console.log(`Schema: ${catalog.schema_version}, checked on: ${catalog.checked_on}`);
console.log(`Total courses: ${catalog.courses.length}`);
console.log(`Total branches: ${catalog.branches.length}`);
catalog.branches.forEach((b, i) => {
  console.log(`${i + 1}. [${b.id}] ${b.name} (Source: ${b.source_id})`);
  console.log(`   Sem 3 courses: ${b.semester_course_ids['3']?.length || 0}, Sem 4 courses: ${b.semester_course_ids['4']?.length || 0}`);
});
console.log(`First year: Sem 1 courses: ${catalog.first_year.semester_course_ids['1'].length}, Sem 2: ${catalog.first_year.semester_course_ids['2'].length}, Bridge: ${catalog.first_year.bridge_course_ids.length}`);
