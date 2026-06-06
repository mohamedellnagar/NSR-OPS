import { sendReportNow } from './server/whatsappScheduler.js';

console.log('Testing sendReportNow(180003)...');
const result = await sendReportNow(180003);
console.log('Result:', JSON.stringify(result, null, 2));
