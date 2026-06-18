from pathlib import Path
import pandas as pd
import numpy as np
import json, re, math, shutil, html

import argparse
parser=argparse.ArgumentParser()
parser.add_argument('--atlas-dir', type=Path, required=True)
parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parent)
args=parser.parse_args()
SRC=args.atlas_dir
ROOT=args.output
for p in [ROOT/'data', ROOT/'assets'/'subreddits', ROOT/'assets'/'fandoms', ROOT/'assets'/'sources', ROOT/'assets'/'illustrations']:
    p.mkdir(parents=True, exist_ok=True)

data_dir = SRC/'data'
docs = pd.read_csv(data_dir/'documents_with_topics.csv', low_memory=False)
topics = pd.read_csv(data_dir/'topics.csv')
topic_month = pd.read_csv(data_dir/'topic_month.csv')
topic_community = pd.read_csv(data_dir/'topic_community.csv')
phrases_tc = pd.read_csv(data_dir/'phrases_by_topic_community.csv')
entities = pd.read_csv(data_dir/'entities.csv')
entity_timeline = pd.read_csv(data_dir/'entity_timeline.csv')
fandoms = pd.read_csv(data_dir/'fandoms.csv')
semantic = pd.read_csv(data_dir/'semantic_map.csv')
source_flows = pd.read_csv(data_dir/'source_flows.csv')
bursts = pd.read_csv(data_dir/'bursts.csv')
summary = json.loads((data_dir/'summary.json').read_text(encoding='utf-8'))
overrides = json.loads((SRC/'editorial_overrides.json').read_text(encoding='utf-8'))

topic_labels = {int(k): v for k,v in overrides['topic_labels'].items()}
aliases = overrides['entity_aliases']
blacklist = set(overrides['entity_blacklist']) | {'It','In the','Long','Look','Does the','Feb','Oct','Poster','AMA','Thoughts','Trying','Share','Announcement','Gaming','PM ET',"I'll",'Pok','Star'}
macro_map = {0:'everyday',2:'everyday',5:'everyday',15:'everyday',1:'power',3:'power',7:'power',10:'power',13:'power',16:'power',17:'power',4:'technology',6:'technology',8:'technology',14:'technology',9:'culture',12:'culture',11:'science'}
macro_labels = {'everyday':'Повседневная жизнь','power':'Власть и конфликты','technology':'Технологии и платформы','culture':'Игры, кино и фандомы','science':'Наука и здоровье'}
macro_descriptions = {'everyday':'Личные истории, вопросы, отношения, работа и небольшие ритуалы.','power':'Политики, государства, войны, тарифы и институты.','technology':'Компании, платформы, устройства, ИИ и цифровой доступ.','culture':'Релизы, франшизы, трейлеры, рекомендации и фанатские разговоры.','science':'Исследования, здоровье, мозг, климат и доказательства.'}
macro_colors = {'everyday':'#ef6c57','power':'#22356f','technology':'#7b61c8','culture':'#e8a52b','science':'#2b9b84'}

docs['domain'] = docs['domain'].fillna('')
docs['selftext'] = docs['selftext'].fillna('')
docs['title'] = docs['title'].fillna('')
docs['macro'] = docs['topic_id'].map(macro_map)
docs['is_external'] = docs['domain'].ne('') & ~docs['domain'].str.contains(r'(?:^|\.)reddit\.com$|(?:^|\.)redd\.it$', regex=True, na=False)
docs['is_question'] = docs['title'].str.strip().str.endswith('?')
docs['has_text'] = docs['selftext'].str.strip().ne('')
docs['post_mode'] = np.select([docs['is_external'], docs['is_question'], docs['has_text']], ['external','question','text'], default='other')

mode_groups = {'newsroom':['news','worldnews','science','technology'], 'forum':['CasualConversation','NoStupidQuestions'], 'fandom':['movies','gaming']}
mode_cards=[]
for mode_id, communities in mode_groups.items():
    group=docs[docs['subreddit'].isin(communities)]
    breakdown=group['post_mode'].value_counts(normalize=True).mul(100).round(1).to_dict()
    top_domains=group.loc[group['is_external'],'domain'].value_counts().head(4).index.tolist()
    mode_cards.append({'id':mode_id,'communities':communities,'posts':int(len(group)),'external':float(breakdown.get('external',0)),'question':float(breakdown.get('question',0)),'text':float(breakdown.get('text',0)),'top_domains':top_domains})

semantic['macro']=semantic['topic_id'].map(macro_map)
semantic=semantic.dropna(subset=['macro','x','y']).copy()
parts=[]
for (_, _), g in semantic.groupby(['macro','month']):
    parts.append(g.sample(min(len(g),55), random_state=42))
semantic_sample=pd.concat(parts, ignore_index=True)
semantic_points=semantic_sample[['x','y','macro','subreddit','month','title','reddit_url','topic_id']].to_dict(orient='records')

entities=entities[~entities['entity'].isin(blacklist)].copy()
entities['entity']=entities['entity'].replace(aliases)
entities.loc[entities['entity']=='Putin','entity']='Vladimir Putin'
entities=(entities.groupby('entity',as_index=False).agg(mentions=('mentions','sum'),months=('months','max'),communities=('communities','max'),entity_type=('entity_type','first'),top_community=('top_community','first'),top_month=('top_month','first'),example_titles_json=('example_titles_json','first')).sort_values('mentions',ascending=False))

timeline=entity_timeline[~entity_timeline['entity'].isin(blacklist)].copy()
timeline['entity']=timeline['entity'].replace(aliases)
timeline.loc[timeline['entity']=='Putin','entity']='Vladimir Putin'
timeline=timeline.groupby(['entity','month','subreddit'],as_index=False)['mentions'].sum()

entity_keep=['Donald Trump','Ukraine','China','Russia','Gaza','United States','Israel','India','Iran','Vladimir Putin','Elon Musk','Google','Canada','Europe','Microsoft','TikTok','Apple','Tesla','Hamas','Japan','ChatGPT','OpenAI','White House','Pakistan']
entity_wall=entities[entities['entity'].isin(entity_keep)].sort_values('mentions',ascending=False)
timeline_top=timeline[timeline['entity'].isin(entity_wall['entity'])]

fandom_aliases={'Switch':'Nintendo Switch','PS5':'PlayStation 5'}
fandoms=fandoms[~fandoms['entity'].isin(blacklist)].copy()
fandoms['entity']=fandoms['entity'].replace(fandom_aliases)
fandom_wanted=['Nintendo','Steam','Xbox','Nintendo Switch','GTA','PlayStation 5','Battlefield','Netflix','Sinners','Disney','Witcher','Minecraft','Clair Obscur','Borderlands','Superman','Cyberpunk']
fandom_cards=[]
for name in fandom_wanted:
    rows=fandoms[fandoms['entity']==name]
    if rows.empty: continue
    row=rows.sort_values('mentions',ascending=False).iloc[0]
    examples=json.loads(row['example_titles_json'])
    fandom_cards.append({'name':name,'mentions':int(row['mentions']),'community':row['top_community'],'peak_month':row['top_month'],'example':examples[0]['title'] if examples else '', 'reddit_url':examples[0]['reddit_url'] if examples else '#threads','cover':f"assets/fandom-posters/{re.sub(r'[^a-z0-9]+','_',name.lower()).strip('_')}.webp"})

source_domain_aliases={'youtu.be':'youtube.com','www.youtube.com':'youtube.com','m.youtube.com':'youtube.com'}
source_flows=source_flows.copy()
source_flows['domain']=source_flows['domain'].replace(source_domain_aliases)
top_source_totals=source_flows.groupby('domain')['posts'].sum().sort_values(ascending=False)
source_names=top_source_totals.head(16).index.tolist()
source_data=[]
for domain in source_names:
    flows=source_flows[source_flows['domain']==domain].groupby('subreddit')['posts'].sum().sort_values(ascending=False)
    source_data.append({'domain':domain,'posts':int(flows.sum()),'communities':[{'subreddit':k,'posts':int(v)} for k,v in flows.head(5).items()],'mark':f"assets/sources/{re.sub(r'[^a-z0-9]+','_',domain.lower()).strip('_')}.svg"})

month_scene_specs={
'2025-01':{'title':'Платформы оказались в центре разговора','items':['TikTok','DeepSeek'],'label':'TikTok + DeepSeek','symbol':'signal'},
'2025-02':{'title':'DOGE связал новости, технологии и бытовые вопросы','items':['DOGE','Elon Musk'],'label':'DOGE + Musk','symbol':'grid'},
'2025-03':{'title':'Гренландия, Канада и Signal вошли в общую повестку','items':['Greenland','Canada','Signal'],'label':'Greenland + Canada','symbol':'north'},
'2025-04':{'title':'Тарифы столкнулись с поп-культурой и релизами','items':['tariffs','Pope Francis','Sinners'],'label':'Tariffs + Sinners','symbol':'tariff'},
'2025-05':{'title':'Индия и Пакистан соседствовали с GTA и Witcher','items':['Pakistan','India','GTA','Witcher'],'label':'India–Pakistan + GTA','symbol':'split'},
'2025-06':{'title':'Иран стал сквозным сюжетом шести сообществ','items':['Iran','Israel','Tehran'],'label':'Iran','symbol':'burst'},
'2025-07':{'title':'Superman и Stop Killing Games собрали культурную повестку','items':['Superman','Stop Killing Games','Steam'],'label':'Superman + SKG','symbol':'cape'},
'2025-08':{'title':'Переговоры и Battlefield разделили новостной и игровой мир','items':['Vladimir Putin','Putin','Battlefield','Alaska'],'label':'Putin + Battlefield','symbol':'meeting'},
'2025-09':{'title':'Charlie Kirk и Borderlands разошлись по разным частям Reddit','items':['Charlie Kirk','Borderlands','Nepal'],'label':'Kirk + Borderlands','symbol':'cross'},
'2025-10':{'title':'Halloween, Nobel и Xbox сделали месяц многослойным','items':['Halloween','Nobel Prize','Xbox'],'label':'Halloween + Nobel','symbol':'moon'},
'2025-11':{'title':'Thanksgiving и соцсети вернули разговор к повседневности','items':['Thanksgiving','Instagram','WhatsApp','Cyberpunk'],'label':'Thanksgiving + social','symbol':'table'},
'2025-12':{'title':'Christmas прошёл через семь сообществ','items':['Christmas','Game Awards','Taiwan'],'label':'Christmas','symbol':'star'}}
month_names={'2025-01':'Январь','2025-02':'Февраль','2025-03':'Март','2025-04':'Апрель','2025-05':'Май','2025-06':'Июнь','2025-07':'Июль','2025-08':'Август','2025-09':'Сентябрь','2025-10':'Октябрь','2025-11':'Ноябрь','2025-12':'Декабрь'}

def find_examples(items, month, n=4):
    pattern='|'.join(re.escape(x) for x in items)
    matches=docs[docs['month'].eq(month) & docs['title'].str.contains(pattern,case=False,regex=True,na=False)]
    if matches.empty: matches=docs[docs['month'].eq(month)].sort_values('topic_confidence',ascending=False)
    matches=matches.drop_duplicates('title').head(n)
    return [{'subreddit':r.subreddit,'title':r.title,'url':r.reddit_url} for r in matches.itertuples(index=False)]

month_scenes=[]
for month,spec in month_scene_specs.items():
    relevant=bursts[(bursts['month']==month)&bursts['item'].isin(spec['items'])]
    month_scenes.append({'month':month,'month_name':month_names[month],'title':spec['title'],'label':spec['label'],'symbol':spec['symbol'],'count':int(relevant['count'].max()) if not relevant.empty else 0,'community_spread':int(relevant['community_spread'].max()) if not relevant.empty else 1,'examples':find_examples(spec['items'],month,4),'art':f"assets/months/{month}.webp"})

topic_lens_ids=[0,1,4,9,11,12]
topic_lenses=[]
for topic_id in topic_lens_ids:
    base=topics[topics['topic_id']==topic_id].iloc[0]
    top_words=json.loads(base['top_terms_json'])
    reps=json.loads(base['representative_posts_json'])[:6]
    communities=topic_community[topic_community['topic_id']==topic_id].sort_values('share',ascending=False).head(5)
    dialects=[]
    for subreddit in communities['subreddit'].head(3):
        words=phrases_tc[(phrases_tc['topic_id']==topic_id)&(phrases_tc['subreddit']==subreddit)].sort_values('weight',ascending=False).head(12)
        dialects.append({'subreddit':subreddit,'words':[{'text':r.phrase,'weight':float(r.weight)} for r in words.itertuples(index=False)]})
    topic_lenses.append({'id':int(topic_id),'label':topic_labels[int(topic_id)],'macro':macro_map[int(topic_id)],'posts':int(base['posts']),'peak_month':base['peak_month'],'words':top_words[:18],'communities':[{'subreddit':r.subreddit,'share':float(r.share)} for r in communities.itertuples(index=False)],'dialects':dialects,'posts_examples':reps})

thread_gallery=[]; seen=set()
for scene in month_scenes:
    for item in scene['examples'][:2]:
        if item['title'] in seen: continue
        seen.add(item['title'])
        thread_gallery.append({'month':scene['month'],'subreddit':item['subreddit'],'title':item['title'],'url':item['url'],'scene':scene['label']})
thread_gallery=thread_gallery[:18]

subreddit_titles={'worldnews':'Мировая новостная лента','news':'Американская новостная лента','science':'Научные публикации и их пересказ','technology':'Технологические продукты и компании','movies':'Киноиндустрия и зрительские разговоры','gaming':'Игровые релизы, платформы и фандомы','CasualConversation':'Повседневные истории и ритуалы','NoStupidQuestions':'Вопросы, на которые хочется получить человеческий ответ'}
subreddit_profiles=[]
for subreddit in docs['subreddit'].unique():
    group=docs[docs['subreddit']==subreddit]
    top_macro=group['macro'].value_counts(normalize=True).idxmax()
    modes=group['post_mode'].value_counts(normalize=True).mul(100).round(1).to_dict()
    subreddit_profiles.append({'id':subreddit,'title':subreddit_titles[subreddit],'posts':int(len(group)),'top_macro':top_macro,'external':float(modes.get('external',0)),'question':float(modes.get('question',0)),'text':float(modes.get('text',0)),'icon':f"assets/community-nav/{subreddit.lower()}.svg"})

site_data={'summary':{'discovery_posts':summary['discovery_posts'],'balanced_posts':summary['balanced_posts'],'communities':8,'months':12,'topics':18},'macros':[{'id':m,'label':macro_labels[m],'description':macro_descriptions[m],'color':macro_colors[m]} for m in macro_labels],'mode_cards':mode_cards,'semantic_points':semantic_points,'subreddits':subreddit_profiles,'months':month_scenes,'entities':entity_wall[['entity','mentions','communities','top_community','top_month','entity_type']].to_dict(orient='records'),'entity_timeline':timeline_top.to_dict(orient='records'),'fandoms':fandom_cards,'sources':source_data,'topic_lenses':topic_lenses,'threads':thread_gallery}
(ROOT/'data'/'site_data.json').write_text(json.dumps(site_data,ensure_ascii=False,separators=(',',':')),encoding='utf-8')

def svg_escape(t): return html.escape(str(t))
def write_svg(path,content,width,height): path.write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}">{content}</svg>',encoding='utf-8')

subreddit_styles={'worldnews':('#23356f','W'),'news':('#ec5f44','N'),'science':('#2b9b84','S'),'technology':('#7b61c8','T'),'movies':('#e8a52b','M'),'gaming':('#ef6c57','G'),'casualconversation':('#e9896a','C'),'nostupidquestions':('#4c7fc2','Q')}
for subreddit,(color,letter) in subreddit_styles.items():
    pattern=''.join(f'<circle cx="{25+(i*37)%190}" cy="{28+(i*53)%185}" r="{6+(i%3)*3}" fill="#fff" opacity=".12"/>' for i in range(12))
    write_svg(ROOT/'assets'/'subreddits'/f'{subreddit}.svg',f'<rect width="220" height="220" rx="52" fill="{color}"/>{pattern}<text x="110" y="138" text-anchor="middle" font-family="Arial" font-weight="900" font-size="96" fill="#fff">{letter}</text>',220,220)

source_palette=['#111827','#d94e32','#2b6cb0','#276749','#6b46c1','#b7791f','#2c7a7b','#9b2c2c']
for idx,src in enumerate(source_data):
    domain=src['domain']; color=source_palette[idx%len(source_palette)]; label=domain.split('.')[0].replace('-',' ').title(); initial=label[:1].upper(); filename=re.sub(r'[^a-z0-9]+','_',domain.lower()).strip('_')+'.svg'
    content=f'<rect width="420" height="180" rx="34" fill="#fff"/><rect width="118" height="180" rx="34" fill="{color}"/><circle cx="59" cy="90" r="34" fill="#fff" opacity=".18"/><text x="59" y="110" text-anchor="middle" font-family="Arial" font-size="58" font-weight="900" fill="#fff">{svg_escape(initial)}</text><text x="145" y="82" font-family="Arial" font-size="31" font-weight="850" fill="#141821">{svg_escape(label)}</text><text x="145" y="119" font-family="Arial" font-size="19" fill="#697180">{svg_escape(domain)}</text>'
    source_mark_path=ROOT/'assets'/'sources'/filename
    if not source_mark_path.exists():
        write_svg(source_mark_path,content,420,180)

cover_gradients=[('#ff4b16','#ff9f70'),('#1f3a8a','#6ea8fe'),('#6b21a8','#d8b4fe'),('#0f766e','#5eead4'),('#9a3412','#fdba74'),('#3f6212','#bef264'),('#831843','#f9a8d4'),('#312e81','#a5b4fc')]
for idx,card in enumerate(fandom_cards):
    name=card['name']; c1,c2=cover_gradients[idx%len(cover_gradients)]; initials=''.join(w[0] for w in re.findall(r'[A-Za-z0-9]+',name)[:2]).upper() or 'F'; pattern=''.join(f'<circle cx="{50+(i*83)%520}" cy="{65+(i*67)%680}" r="{18+(i%4)*8}" fill="#fff" opacity=".08"/>' for i in range(18)); filename=re.sub(r'[^a-z0-9]+','_',name.lower()).strip('_')+'.svg'
    content=f'<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{c1}"/><stop offset="1" stop-color="{c2}"/></linearGradient></defs><rect width="600" height="780" rx="42" fill="url(#g)"/>{pattern}<rect x="44" y="44" width="150" height="42" rx="21" fill="#fff" opacity=".16"/><text x="68" y="73" font-family="Arial" font-size="20" font-weight="800" fill="#fff">REDDIT 2025</text><text x="300" y="410" text-anchor="middle" font-family="Arial" font-size="174" font-weight="900" fill="#fff" opacity=".2">{svg_escape(initials)}</text><text x="54" y="648" font-family="Arial" font-size="48" font-weight="900" fill="#fff">{svg_escape(name[:22])}</text><text x="54" y="704" font-family="Arial" font-size="24" font-weight="700" fill="#fff" opacity=".85">Пик: {svg_escape(card["peak_month"])}</text>'
    write_svg(ROOT/'assets'/'fandoms'/filename,content,600,780)

month_symbols={'signal':'<path d="M140 320Q300 130 460 320" fill="none" stroke="#fff" stroke-width="18"/><circle cx="300" cy="320" r="28" fill="#fff"/><circle cx="300" cy="320" r="100" fill="none" stroke="#fff" stroke-width="10" opacity=".4"/>','grid':''.join(f'<rect x="{100+(i%4)*105}" y="{155+(i//4)*105}" width="70" height="70" rx="16" fill="#fff" opacity="{.25+.04*i}"/>' for i in range(12)),'north':'<path d="M300 110L420 420L300 360L180 420Z" fill="#fff" opacity=".82"/><circle cx="300" cy="290" r="36" fill="#fff"/>','tariff':'<path d="M110 380H490M150 310H450M190 240H410M230 170H370" stroke="#fff" stroke-width="20" stroke-linecap="round"/>','split':'<path d="M90 390L255 120L300 360L345 120L510 390Z" fill="#fff" opacity=".75"/>','burst':''.join(f'<line x1="300" y1="300" x2="{300+190*math.cos(i*math.pi/6)}" y2="{300+190*math.sin(i*math.pi/6)}" stroke="#fff" stroke-width="14" stroke-linecap="round"/>' for i in range(12))+'<circle cx="300" cy="300" r="68" fill="#fff"/>','cape':'<path d="M165 140Q300 70 435 140L380 470Q300 390 220 470Z" fill="#fff" opacity=".82"/>','meeting':'<circle cx="210" cy="250" r="90" fill="#fff" opacity=".72"/><circle cx="390" cy="250" r="90" fill="#fff" opacity=".42"/><path d="M210 390Q300 300 390 390" fill="none" stroke="#fff" stroke-width="18"/>','cross':'<rect x="255" y="100" width="90" height="400" rx="30" fill="#fff" opacity=".78"/><rect x="100" y="255" width="400" height="90" rx="30" fill="#fff" opacity=".42"/>','moon':'<circle cx="300" cy="290" r="175" fill="#fff" opacity=".85"/><circle cx="365" cy="230" r="175" fill="#7b61c8"/>','table':'<rect x="110" y="250" width="380" height="120" rx="35" fill="#fff" opacity=".82"/><circle cx="190" cy="210" r="45" fill="#fff"/><circle cx="300" cy="190" r="45" fill="#fff"/><circle cx="410" cy="210" r="45" fill="#fff"/>','star':'<path d="M300 90L350 235L505 240L382 332L425 485L300 398L175 485L218 332L95 240L250 235Z" fill="#fff" opacity=".86"/>'}
month_colors=['#22356f','#7b61c8','#2b9b84','#d94e32','#e8a52b','#8c2f39','#295f98','#3f6212','#8a3f79','#7b61c8','#b7791f','#c73b4b']
for idx,scene in enumerate(month_scenes):
    color=month_colors[idx]; symbol=month_symbols[scene['symbol']]
    content=f'<rect width="600" height="600" rx="48" fill="{color}"/><circle cx="470" cy="110" r="120" fill="#fff" opacity=".08"/><circle cx="120" cy="510" r="160" fill="#fff" opacity=".07"/>{symbol}<text x="45" y="64" font-family="Arial" font-size="24" font-weight="900" fill="#fff" opacity=".88">{scene["month_name"].upper()}</text><text x="45" y="548" font-family="Arial" font-size="31" font-weight="900" fill="#fff">{svg_escape(scene["label"])}</text>'
    write_svg(ROOT/'assets'/'illustrations'/f"month_{scene['month'][-2:]}.svg",content,600,600)

hero_svg='<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#171b2e"/><stop offset="1" stop-color="#ff4b16"/></linearGradient></defs><rect width="900" height="900" rx="72" fill="url(#bg)"/><g opacity=".14" fill="#fff">'+''.join(f'<circle cx="{80+(i*97)%760}" cy="{75+(i*137)%760}" r="{8+(i%5)*4}"/>' for i in range(42))+'</g><g fill="none" stroke="#fff" stroke-width="3" opacity=".45"><path d="M130 630C260 390 370 690 520 410S720 220 790 330"/><path d="M140 250C280 110 430 380 610 170"/><path d="M220 760C360 620 480 760 700 610"/></g><g fill="#fff"><circle cx="130" cy="630" r="18"/><circle cx="520" cy="410" r="24"/><circle cx="790" cy="330" r="15"/><circle cx="610" cy="170" r="20"/><circle cx="220" cy="760" r="16"/><circle cx="700" cy="610" r="22"/></g><rect x="95" y="95" width="330" height="160" rx="30" fill="#fff" opacity=".94"/><text x="130" y="148" font-family="Arial" font-size="24" font-weight="800" fill="#ff4b16">REDDIT 2025</text><text x="130" y="194" font-family="Arial" font-size="35" font-weight="900" fill="#141821">8 параллельных</text><text x="130" y="232" font-family="Arial" font-size="35" font-weight="900" fill="#141821">миров</text>'
write_svg(ROOT/'assets'/'illustrations'/'hero.svg',hero_svg,900,900)

print(json.dumps({'site_data_bytes':(ROOT/'data'/'site_data.json').stat().st_size,'semantic_points':len(semantic_points),'fandom_cards':len(fandom_cards),'sources':len(source_data)},ensure_ascii=False))
