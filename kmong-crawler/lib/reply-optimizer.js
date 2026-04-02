/**
 * 크몽 Phase 2 — 답변 학습 엔진
 * 1. 보낸 답변의 후속 결과 추적 (재응답, 견적, 결제)
 * 2. 템플릿별 전환율 업데이트
 * 3. 주간 학습 리포트 생성
 */

const { supabase } = require('./supabase');
const { notify } = require('./telegram');

/**
 * 보낸 답변의 후속 결과 추적 (지난 7일)
 * - inbox 크롤링 결과로 고객 재응답 여부 확인
 * - orders 크롤링 결과로 결제 여부 확인
 */
async function trackReplyOutcomes(days = 7) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  // 지난 N일간 발송된 답변 조회
  const { data: replies } = await supabase
    .from('kmong_reply_history')
    .select('*, kmong_inquiries!inquiry_id(customer_name, product_id, status)')
    .not('sent_at', 'is', null)
    .gte('sent_at', since.toISOString());

  if (!replies || replies.length === 0) {
    console.log('[학습] 추적 대상 답변 없음');
    return [];
  }

  console.log(`[학습] ${replies.length}건 답변 추적 중...`);

  for (const reply of replies) {
    const inquiry = reply.kmong_inquiries;
    if (!inquiry) continue;

    // 고객 재응답 확인: 같은 고객의 후속 문의가 있는지
    const { data: followups } = await supabase
      .from('kmong_inquiries')
      .select('id')
      .eq('customer_name', inquiry.customer_name)
      .gt('inquiry_date', reply.sent_at)
      .limit(1);

    const customerReplied = followups && followups.length > 0;

    // 결제 확인: 같은 product_id의 주문이 있는지
    let resultedInPayment = false;
    let paymentAmount = 0;

    if (inquiry.product_id) {
      const { data: orders } = await supabase
        .from('kmong_orders')
        .select('amount, status')
        .eq('product_id', inquiry.product_id)
        .gte('order_date', reply.sent_at.split('T')[0])
        .in('status', ['거래완료', '진행중'])
        .limit(1);

      if (orders && orders.length > 0) {
        resultedInPayment = true;
        paymentAmount = orders[0].amount || 0;
      }
    }

    // 효과 점수 계산 (0~100)
    let score = 0;
    if (customerReplied) score += 40;
    if (reply.resulted_in_quote) score += 30;
    if (resultedInPayment) score += 30;

    // 업데이트
    await supabase
      .from('kmong_reply_history')
      .update({
        customer_replied: customerReplied,
        customer_replied_at: customerReplied ? new Date().toISOString() : null,
        resulted_in_payment: resultedInPayment,
        payment_amount: paymentAmount,
        effectiveness_score: score,
      })
      .eq('id', reply.id);
  }

  return replies;
}

/**
 * 템플릿별 전환율 업데이트
 */
async function updateTemplateStats() {
  const { data: templates } = await supabase
    .from('kmong_reply_templates')
    .select('id, template_name')
    .eq('is_active', true);

  if (!templates) return;

  for (const tpl of templates) {
    // 이 템플릿으로 보낸 답변 통계
    const { data: history } = await supabase
      .from('kmong_reply_history')
      .select('customer_replied, resulted_in_quote, resulted_in_payment')
      .eq('template_id', tpl.id)
      .not('sent_at', 'is', null);

    if (!history || history.length === 0) continue;

    const totalSent = history.length;
    const totalReplied = history.filter(h => h.customer_replied).length;
    const totalQuoted = history.filter(h => h.resulted_in_quote).length;
    const totalPaid = history.filter(h => h.resulted_in_payment).length;

    const replyRate = totalSent > 0 ? parseFloat((totalReplied / totalSent * 100).toFixed(2)) : 0;
    const quoteRate = totalSent > 0 ? parseFloat((totalQuoted / totalSent * 100).toFixed(2)) : 0;
    const conversionRate = totalSent > 0 ? parseFloat((totalPaid / totalSent * 100).toFixed(2)) : 0;

    await supabase
      .from('kmong_reply_templates')
      .update({
        total_sent: totalSent,
        total_replied: totalReplied,
        total_quoted: totalQuoted,
        total_paid: totalPaid,
        reply_rate: replyRate,
        quote_rate: quoteRate,
        conversion_rate: conversionRate,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tpl.id);

    console.log(`[학습] ${tpl.template_name}: 발송 ${totalSent} / 재응답 ${totalReplied}(${replyRate}%) / 결제 ${totalPaid}(${conversionRate}%)`);
  }
}

/**
 * 주간 학습 리포트 생성 (텔레그램 발송)
 */
async function generateWeeklyReport() {
  console.log('=== 크몽 답변 학습 주간 리포트 ===');

  // 전환율 업데이트
  await trackReplyOutcomes(7);
  await updateTemplateStats();

  // 템플릿 랭킹
  const { data: templates } = await supabase
    .from('kmong_reply_templates')
    .select('*')
    .eq('is_active', true)
    .gt('total_sent', 0)
    .order('conversion_rate', { ascending: false });

  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const dateRange = `${weekAgo.getMonth() + 1}/${weekAgo.getDate()}~${now.getMonth() + 1}/${now.getDate()}`;

  let report = `크몽 답변 학습 리포트 (${dateRange})\n\n`;

  if (templates && templates.length > 0) {
    const medals = ['1위', '2위', '3위'];
    report += `템플릿 성과 랭킹:\n`;
    templates.forEach((t, i) => {
      const medal = medals[i] || `${i + 1}위`;
      report += `${medal} ${t.template_name}: 재응답 ${t.reply_rate}% / 결제 ${t.conversion_rate}%\n`;
    });

    // 학습 인사이트
    if (templates.length >= 2) {
      const best = templates[0];
      const worst = templates[templates.length - 1];
      report += `\n학습 결과:\n`;
      report += `→ "${best.template_name}" 전환율 가장 높음\n`;
      if (best.conversion_rate > worst.conversion_rate) {
        const ratio = worst.conversion_rate > 0
          ? (best.conversion_rate / worst.conversion_rate).toFixed(1)
          : '∞';
        report += `→ 최저 대비 ${ratio}배 높은 전환율\n`;
      }
      report += `→ 다음 주부터 "${best.template_name}" 우선 적용\n`;
    }
  } else {
    report += `아직 발송된 답변이 없어 학습 데이터가 부족합니다.\n`;
    report += `답변 발송 후 다음 주 리포트에 반영됩니다.\n`;
  }

  console.log(report);
  notify(report);

  return report;
}

/**
 * 학습 루프 실행 (analyze-daily.js에서 호출)
 */
async function runLearningLoop() {
  try {
    await trackReplyOutcomes(7);
    await updateTemplateStats();
    console.log('[학습] 학습 루프 완료');
  } catch (err) {
    console.error(`[학습 에러] ${err.message}`);
  }
}

module.exports = {
  trackReplyOutcomes,
  updateTemplateStats,
  generateWeeklyReport,
  runLearningLoop,
};
