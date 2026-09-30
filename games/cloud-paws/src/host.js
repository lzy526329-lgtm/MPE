/** Combine app-page and native document visibility without resetting the run. */
export function mountHostVisibility({onHide,onShow,host=window,page=document}) {
 let hostVisible=true;
 let visible=!page.hidden;
 const sync=()=>{
  const next=hostVisible&&!page.hidden;
  if(next===visible)return;
  visible=next;
  if(visible)onShow();else onHide();
 };
 const message=event=>{
  if(host.parent===host||event.source!==host.parent||event.origin!==host.location.origin)return;
  if(event.data?.type!=='cloud-paws:visibility'||typeof event.data.visible!=='boolean')return;
  hostVisible=event.data.visible;
  sync();
 };
 host.addEventListener('message',message);
 page.addEventListener('visibilitychange',sync);
 return {isVisible:()=>visible,dispose(){host.removeEventListener('message',message);page.removeEventListener('visibilitychange',sync)}};
}
