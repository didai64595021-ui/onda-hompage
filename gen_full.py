import pathlib
TARGET = pathlib.Path("/home/onda/projects/onda-hompage/portfolio-sites/lawfirm/attorneys.html")
orig = TARGET.read_text()
def find_section(text, attr):
    idx = text.find(attr)
    if idx == -1:
        return -1, -1
    sec_start = text.rfind("<section", 0, idx)
    depth = 0
    i = sec_start
    while i < len(text):
        if text[i:i+8] == "<section":
            depth += 1
        elif text[i:i+10] == "</section>":
            depth -= 1
            if depth == 0:
                return sec_start, i + 10
        i += 1
    return sec_start, len(text)
ks, ke = find_section(orig, 'id="profile-kim"')
ps, pe = find_section(orig, 'id="profile-park"')
ls, le = find_section(orig, 'id="profile-lee"')
cs, ce = find_section(orig, 'id="profile-choi"')
js, je = find_section(orig, 'id="profile-jung"')
kim = orig[ks:ke]
park = orig[ps:pe]
lee = orig[ls:le]
choi = orig[cs:ce]
jung = orig[js:je]
hdr_end = orig.find('<section class="section section--dark">')
hdr = orig[:hdr_end]
gs, ge = find_section(orig, 'Our Attorneys')
grid = orig[gs:ge]
prs, _ = find_section(orig, 'Our Promise')
tail = orig[prs:]
old_se = "button,a{min-height:44px}</style>"
css_new = "\n".join([
"button,a{min-height:44px}",
".quote-block{border-left:3px solid var(--indigo,#3F51B5);padding:24px 32px;margin-bottom:32px;background:var(--gray-100,#F5F5F5);transition:all .3s}",
".quote-block:hover{background:var(--gray-200,#EEE);transform:translateX(4px)}",
".quote-block__text{font-style:italic;font-size:1.05rem;line-height:1.8;color:var(--gray-800,#424242);margin-bottom:16px}",
".quote-block__author{font-weight:700;font-size:.95rem;color:var(--black,#000)}",
".quote-block__role{font-size:.8rem;color:var(--gray-500,#9E9E9E);margin-top:4px;margin-bottom:0}",
".team-org{display:flex;flex-direction:column;align-items:center;gap:40px;padding:32px 0}",
".team-org__level{display:flex;justify-content:center;gap:32px;flex-wrap:wrap;width:100%}",
".team-org__node{text-align:center;padding:24px 32px;border:2px solid var(--gray-300,#E0E0E0);min-width:200px;transition:all .3s;background:var(--white,#FFF)}",
".team-org__node:hover{border-color:var(--indigo,#3F51B5);transform:translateY(-4px);box-shadow:0 8px 24px rgba(0,0,0,.08)}",
".team-org__node--lead{border-color:var(--indigo,#3F51B5);background:var(--black,#000);color:var(--white,#FFF)}",
".team-org__node--lead:hover{border-color:var(--burgundy,#881337)}",
".team-org__node--lead .team-org__team{color:var(--gray-400,#BDBDBD)}",
".team-org__name{font-weight:700;font-size:1.1rem;margin-bottom:4px}",
".team-org__position{font-size:.85rem;color:var(--gray-600,#757575);margin-bottom:4px}",
".team-org__team{font-size:.75rem;color:var(--indigo,#3F51B5);font-weight:600;letter-spacing:.05em;margin-bottom:0}",
".team-org__connector{width:100%;height:1px;background:var(--gray-300,#E0E0E0);max-width:700px;margin:0 auto}",
".credential-card{background:var(--white,#FFF);border:1px solid var(--gray-200,#EEE);padding:32px;transition:all .3s}",
".credential-card:hover{border-color:var(--black,#000);transform:translateY(-2px)}",
".credential-card__name{font-weight:700;font-size:1.15rem;margin-bottom:8px}",
".credential-card__role{font-size:.8rem;color:var(--indigo,#3F51B5);font-weight:600;letter-spacing:.05em;margin-bottom:16px}",
".credential-card__list{list-style:none;padding:0;margin:0}",
".credential-card__list li{padding:8px 0;font-size:.9rem;color:var(--gray-700,#616161);border-bottom:1px solid var(--gray-100,#F5F5F5);padding-left:20px;position:relative}",
".credential-card__list li:last-child{border-bottom:none}",
"@media(max-width:768px){.team-org__node{min-width:160px;padding:16px 24px}.team-org__level{gap:16px}.quote-block{padding:16px 24px}}",
"@media(max-width:480px){.team-org__node{min-width:140px;padding:16px}.team-org__name{font-size:.95rem}}",
"@media(max-width:375px){.team-org__level{flex-direction:column;align-items:center;gap:16px}.team-org__node{min-width:100%;max-width:280px}}",
"</style>",
])
hdr = hdr.replace(old_se, css_new)
grid = grid.replace("grid grid--4", "grid grid--5")
hc = "\n".join([
"","        <!-- 한지윤 변호사 -->",
'        <div class="attorney-card reveal">',
'          <div class="attorney-card__image">',
"            <img",
'              src="https://images.unsplash.com/photo-1551836022-deb4988cc6c0?w=400&h=533&fit=crop&crop=face"',
'              alt="한지윤 변호사"',
'              class="img-grayscale"',
"            >",
"          </div>",
'          <div class="attorney-card__info">',
'            <h3 class="attorney-card__name">한지윤</h3>',
'            <p class="attorney-card__role">어소시에이트 변호사 · 행정/환경/에너지</p>',
"          </div>",
"        </div>","",
])
grid = grid.replace("\n      </div>\n    </div>\n  </section>", hc + "      </div>\n    </div>\n  </section>")
kim = kim.replace("소속 변호사 5명", "소속 변호사 6명")
# Load new sections from separate text files
hp = pathlib.Path("/home/onda/projects/onda-hompage/portfolio-sites/lawfirm/han.txt")
pp = pathlib.Path("/home/onda/projects/onda-hompage/portfolio-sites/lawfirm/phil.txt")
tp = pathlib.Path("/home/onda/projects/onda-hompage/portfolio-sites/lawfirm/team.txt")
cp = pathlib.Path("/home/onda/projects/onda-hompage/portfolio-sites/lawfirm/cred.txt")
han_prof = hp.read_text() if hp.exists() else ""
phil = pp.read_text() if pp.exists() else ""
team = tp.read_text() if tp.exists() else ""
cred = cp.read_text() if cp.exists() else ""
tail = tail.replace("60년+", "70년+")
tail = tail.replace("3,000건+", "3,500건+")
tail = tail.replace("서울대, 고려대, 연세대 등 국내 최고 법학전문대학원", "서울대, 고려대, 연세대, 성균관대 등 국내 최고 법학전문대학원")
tail = tail.replace('<a href="practice.html" class="footer__link">지식재산</a>\n        </div>', '<a href="practice.html" class="footer__link">지식재산</a>\n          <a href="practice.html" class="footer__link">행정/환경</a>\n        </div>')
full = hdr + "\n\n  " + grid + "\n\n  " + kim + "\n\n  " + park + "\n\n  " + lee + "\n\n  " + choi + "\n\n  " + jung + "\n\n" + han_prof + "\n" + phil + "\n" + team + "\n" + cred + "\n" + tail
TARGET.write_text(full)
print(f"Written {len(full.splitlines())} lines")
