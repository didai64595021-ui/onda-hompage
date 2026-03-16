// 업종 우선순위 (전환율 높은 순)
const CATEGORIES = [
  { name: '피부과', group: '병원/의원', priority: 1 },
  { name: '치과', group: '병원/의원', priority: 1 },
  { name: '성형외과', group: '병원/의원', priority: 1 },
  { name: '한의원', group: '병원/의원', priority: 1 },
  { name: '영어학원', group: '학원/교육', priority: 2 },
  { name: '수학학원', group: '학원/교육', priority: 2 },
  { name: '코딩학원', group: '학원/교육', priority: 2 },
  { name: '음악학원', group: '학원/교육', priority: 2 },
  { name: '미술학원', group: '학원/교육', priority: 2 },
  { name: '미용실', group: '미용', priority: 3 },
  { name: '네일샵', group: '미용', priority: 3 },
  { name: '속눈썹', group: '미용', priority: 3 },
  { name: '왁싱', group: '미용', priority: 3 },
  { name: '헬스장', group: '헬스/PT', priority: 4 },
  { name: 'PT', group: '헬스/PT', priority: 4 },
  { name: '필라테스', group: '헬스/PT', priority: 4 },
  { name: '요가', group: '헬스/PT', priority: 4 },
  { name: '카페', group: '카페/디저트', priority: 5 },
  { name: '디저트', group: '카페/디저트', priority: 5 },
  { name: '인테리어', group: '인테리어/이사', priority: 6 },
  { name: '이사', group: '인테리어/이사', priority: 6 },
  { name: '펜션', group: '숙박', priority: 7 },
  { name: '숙박', group: '숙박', priority: 7 },
  { name: '맛집', group: '음식점', priority: 8 },
  { name: '음식점', group: '음식점', priority: 8 },
];

// 지역 우선순위 (광고비 지출 여력 높은 순)
const REGIONS = [
  { name: '강남', priority: 1 },
  { name: '서초', priority: 1 },
  { name: '송파', priority: 1 },
  { name: '마포', priority: 2 },
  { name: '용산', priority: 2 },
  { name: '성동', priority: 2 },
  { name: '분당', priority: 3 },
  { name: '판교', priority: 3 },
  { name: '수원', priority: 3 },
  { name: '해운대', priority: 4 },
  { name: '서면', priority: 4 },
  { name: '동성로', priority: 5 },
  { name: '수성구', priority: 5 },
  { name: '종로', priority: 6 },
  { name: '중구', priority: 6 },
  { name: '영등포', priority: 6 },
  { name: '강서', priority: 6 },
  { name: '노원', priority: 6 },
  { name: '관악', priority: 6 },
  { name: '동작', priority: 6 },
  { name: '광진', priority: 6 },
  { name: '일산', priority: 7 },
  { name: '안양', priority: 7 },
  { name: '성남', priority: 7 },
  { name: '용인', priority: 7 },
  { name: '화성', priority: 7 },
  { name: '대전', priority: 8 },
  { name: '광주', priority: 8 },
  { name: '울산', priority: 8 },
  { name: '인천', priority: 8 },
];

// 지역+업종 조합 키워드 생성 (우선순위순 정렬)
function generateKeywords(options = {}) {
  const { region, category } = options;

  let regions = REGIONS;
  let categories = CATEGORIES;

  if (region) {
    regions = REGIONS.filter(r => r.name.includes(region));
    if (regions.length === 0) {
      regions = [{ name: region, priority: 99 }];
    }
  }

  if (category) {
    categories = CATEGORIES.filter(c => c.name.includes(category));
    if (categories.length === 0) {
      categories = [{ name: category, group: '기타', priority: 99 }];
    }
  }

  const keywords = [];
  for (const r of regions) {
    for (const c of categories) {
      keywords.push({
        keyword: `${r.name} ${c.name}`,
        region: r.name,
        category: c.name,
        categoryGroup: c.group,
        priority: r.priority + c.priority,
      });
    }
  }

  keywords.sort((a, b) => a.priority - b.priority);
  return keywords;
}

module.exports = { CATEGORIES, REGIONS, generateKeywords };
