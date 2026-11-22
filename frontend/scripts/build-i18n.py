# Builds src/i18n/en.json and am.json. Run: node scripts/extract-keys.mjs > /tmp/keys.json && python3 scripts/build-i18n.py
import json, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from am_ui import UI as U1; from am_more import EXTRA as E1; from am_court import UI as U2, SERVER as S2; from am_hr import UI as U3, SERVER as S3, VALUES
from am_certificates import UI as U4, SERVER as S4, VALUES as V4; VALUES = {**VALUES, **V4}
from am_retirement import UI as U5, SERVER as S5, VALUES as V5; VALUES = {**VALUES, **V5}
keys = json.load(open('/tmp/keys.json')); T = {**U1, **E1, **U2, **S2, **U3, **S3, **U4, **S4, **U5, **S5}; en = {}; am = {}; missing = []
for k in sorted(set(keys) | set(S3) | set(S2) | set(S4) | set(S5)):
    if k in T: en[k] = k; am[k] = T[k]
    else: missing.append(k)
for k, (e, a) in VALUES.items(): en['value.' + k] = e; am['value.' + k] = a
for m, (e, a) in {"Jan":("Jan","ጃን"),"Feb":("Feb","ፌብ"),"Mar":("Mar","ማርች"),"Apr":("Apr","ኤፕሪ"),"May":("May","ሜይ"),"Jun":("Jun","ጁን"),"Jul":("Jul","ጁላ"),"Aug":("Aug","ኦገ"),"Sep":("Sep","ሴፕ"),"Oct":("Oct","ኦክቶ"),"Nov":("Nov","ኖቬ"),"Dec":("Dec","ዲሴ")}.items(): en['month.' + m] = e; am['month.' + m] = a
en['and'] = 'and'; am['and'] = 'እና'
print('missing translations:', missing)
d = os.path.join(os.path.dirname(__file__), '..', 'src', 'i18n')
json.dump(dict(sorted(en.items())), open(d + '/en.json', 'w'), ensure_ascii=False, indent=1); json.dump(dict(sorted(am.items())), open(d + '/am.json', 'w'), ensure_ascii=False, indent=1)
print(len(en), 'keys written')
