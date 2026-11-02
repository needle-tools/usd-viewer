const node = (tag, className = '', text = '') => {
  const element = document.createElement(tag);
  element.className = className; element.textContent = text;
  return element;
};

/** Paged arrays and expandable dictionaries shared by inspection views. */
export function renderStructuredValue(value, label) {
  if(Array.isArray(value)) {
    const list=node('ol','usd-property-value-list');list.start=0;list.setAttribute('aria-label',label);
    let shown=0;
    const more=node('button');more.type='button';more.onclick=()=>append();more.className='usd-property-value-more';
    function append() {
      const restoreFocus=document.activeElement===more;
      more.remove();const end=Math.min(value.length,shown+32);
      for(;shown<end;shown++){const item=node('li');item.append(renderStructuredValue(value[shown],`${label}[${shown}]`));list.append(item);}
      if(shown<value.length){more.textContent=`Show ${Math.min(32,value.length-shown)} more`;list.after(more);}
      if(restoreFocus){const target=shown<value.length?more:list;target.tabIndex=0;target.focus({preventScroll:true});}
    }
    const host=node('div');host.append(list);append();
    if(!value.length)host.textContent='[]';return host;
  }
  if(value && typeof value==='object') {
    const entries=Object.entries(value);if(!entries.length)return node('span','','{}');
    const group=node('details','usd-property-value-object'),summary=node('summary','',`${entries.length} fields`),fields=node('dl');
    group.append(summary,fields);
    group.ontoggle=()=>{if(!group.open || fields.childElementCount)return;for(const [key,item] of entries){const name=node('dt','',key),content=node('dd');content.append(renderStructuredValue(item,`${label}.${key}`));fields.append(name,content);}};
    return group;
  }
  return node('span','',value===null?'null':String(value??''));
}
