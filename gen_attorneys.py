import pathlib
TARGET = pathlib.Path("portfolio-sites/lawfirm/attorneys.html")
orig = TARGET.read_text()

def find_section(text, section_id_attr):
    idx = text.find(section_id_attr)
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

kim_s, kim_e = find_section(orig, 'id="profile-kim"')
park_s, park_e = find_section(orig, 'id="profile-park"')
lee_s, lee_e = find_section(orig, 'id="profile-lee"')
choi_s, choi_e = find_section(orig, 'id="profile-choi"')
jung_s, jung_e = find_section(orig, 'id="profile-jung"')

kim_section = orig[kim_s:kim_e]
park_section = orig[park_s:park_e]
lee_section = orig[lee_s:lee_e]
choi_section = orig[choi_s:choi_e]
jung_section = orig[jung_s:jung_e]

header_end = orig.find('<section class="section section--dark">')
header = orig[:header_end]

grid_s, grid_e = find_section(orig, 'Our Attorneys')
grid_section = orig[grid_s:grid_e]

promise_s, _ = find_section(orig, 'Our Promise')
footer_part = orig[promise_s:]

# 1. Update header: add inline CSS for new components
old_style_end = "button,a{min-height:44px}</style>"
new_css_lines = [
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
]
header = header.replace(old_style_end, "\n".join(new_css_lines))

# 2. Update grid: grid--4 -> grid--5, add Han card
grid_section = grid_section.replace("grid grid--4", "grid grid--5")
han_card_lines = [
    "",
    "        <!-- 한지윤 변호사 (NEW) -->",
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
    "        </div>",
    "",
]
han_card = "\n".join(han_card_lines)
# Insert before the closing </div> of the grid
grid_section = grid_section.replace("\n      </div>\n    </div>\n  </section>", han_card + "      </div>\n    </div>\n  </section>")

# 3. Update kim section
kim_section = kim_section.replace("소속 변호사 5명", "소속 변호사 6명")

# 4. Read new section templates
han_profile = pathlib.Path("portfolio-sites/lawfirm/sections/han_profile.html").read_text() if pathlib.Path("portfolio-sites/lawfirm/sections/han_profile.html").exists() else ""
philosophy = ""
team_structure = ""
credentials = ""

# Load from separate files we will create
for name in ["han_profile", "philosophy", "team_structure", "credentials"]:
    f = pathlib.Path(f"portfolio-sites/lawfirm/sections/{name}.html")
    if f.exists():
        locals()[name] = f.read_text()

# 5. Update footer
footer_part = footer_part.replace("60년+", "70년+")
footer_part = footer_part.replace("3,000건+", "3,500건+")
footer_part = footer_part.replace(
    "서울대, 고려대, 연세대 등 국내 최고 법학전문대학원",
    "서울대, 고려대, 연세대, 성균관대 등 국내 최고 법학전문대학원"
)

# Assemble
full = header + "\n\n  " + grid_section + "\n\n  " + kim_section + "\n\n  " + park_section + "\n\n  " + lee_section + "\n\n  " + choi_section + "\n\n  " + jung_section + "\n\n" + han_profile + "\n" + philosophy + "\n" + team_structure + "\n" + credentials + "\n" + footer_part

TARGET.write_text(full)
lines = len(full.splitlines())
print(f"Written {lines} lines")
