"""Slim the Rhemlo bundle into static JSON for the app. Usage: python scripts/prep-data.py <bundle/rhemlo> <public/data>"""
import json,sys,os,glob,gzip,shutil
src,out=sys.argv[1],sys.argv[2]
J=lambda o:json.dumps(o,ensure_ascii=False,separators=(',',':'))
def blocks(bl):
    res=[]
    for b in bl or []:
        t=b.get('type')
        if t=='paragraph': res.append({'t':'p','x':' '.join(s['text'] for s in b.get('sentences',[]))})
        elif t=='list':
            its=[]
            for it in b.get('items',[]):
                its.append(it.get('text') or ' '.join(s['text'] for s in it.get('sentences',[])) or ' '.join(x.get('text','') for x in it.get('blocks',[]) if isinstance(x,dict)))
            res.append({'t':'l','i':its})
        else:
            x=b.get('text') or ' '.join(s['text'] for s in b.get('sentences',[]))
            if x: res.append({'t':'p','x':x})
    return res
for code in ('EN2627','AD2627'):
    md=f'{src}/manuals/{code}'; od=f'{out}/{code}'; os.makedirs(f'{od}/lessons',exist_ok=True); os.makedirs(f'{od}/items',exist_ok=True)
    m=json.load(open(f'{md}/manual.json',encoding='utf-8')); index=[]
    for f in sorted(glob.glob(f'{md}/lessons/L*.json')):
        l=json.load(open(f,encoding='utf-8')); E={e['type']:e for e in l['elements']}
        mv=E.get('memory_verse',{}); printed=mv.get('printed','')
        ref=(E.get('memory_verse',{}).get('refs') or [None])[0]
        secs=[]
        for e in l['elements']:
            t=e['type']
            if t=='introduction': secs.append({'k':'introduction','h':'Introduction','b':blocks(e['blocks'])})
            elif t=='section': secs.append({'k':'section','h':e.get('heading_printed',''),'b':blocks(e['blocks'])})
            elif t=='conclusion': secs.append({'k':'conclusion','h':'Conclusion','b':blocks(e['blocks'])})
            elif t=='questions': secs.append({'k':'questions','h':'Questions','b':[{'t':'l','i':[q.get('text','') for q in e['items']]}]})
        out_l=dict(id=l['id'],n=int(l['number']),q=int(l['quarter']),title=l['title'],date=l['date_printed'],
            mv=mv.get('text',''),mvp=printed,bp=E.get('bible_passage',{}).get('printed',''),
            outline=[p['text'] for p in E.get('outline',{}).get('points',[])],
            readings=[{'d':x['day'],'r':x['printed']} for x in E.get('further_readings',{}).get('items',[])],
            assignment=E.get('assignment',{}).get('printed',''),sections=secs)
        open(f"{od}/lessons/{l['id']}.json",'w',encoding='utf-8').write(J(out_l))
        index.append(dict(id=l['id'],n=out_l['n'],q=out_l['q'],title=l['title'],date=l['date_printed'],mv=out_l['mv'],mvp=printed,bp=out_l['bp'],outline=out_l['outline'],readings=out_l['readings']))
    # items
    cnt=0; cards={}
    for f in sorted(glob.glob(f'{md}/items/L*.items.json')):
        d=json.load(open(f,encoding='utf-8')); L=d['lesson']
        its=[]
        for x in d['items']:
            its.append(dict(u=x['uid'],t=x['type'],f=x['formats'],p=x['prompt'],a=x['answer'],d=[y['text'] for y in x.get('distractors',[])],g=[t for t in x.get('tags',[]) if t.startswith('tier:')][:1],s=x.get('sibling_key'),tg=x.get('target_uid')))
        cnt+=len(its); cards[L]=(len(its),len({i['s'] for i in its}))
        open(f"{od}/items/{L}.json",'w',encoding='utf-8').write(J(its))
    for e in index: e['ic'],e['cc']=cards.get(e['id'],(0,0))
    mm=dict(code=code,title=m['title'],short=m.get('short_title',code),bible=m['bible_version'],groups=m['groups']['ranges'],stages=m['competition']['stages'],lessons=index,items=cnt)
    open(f'{od}/manual.json','w',encoding='utf-8').write(J(mm)); print(code,len(index),cnt)
os.makedirs(f'{out}/bible',exist_ok=True); shutil.copy(f'{src}/bible/KJV.tsv.gz',f'{out}/bible/KJV.tsv.gz')
