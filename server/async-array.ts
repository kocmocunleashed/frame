// Ordered predicates preserve the short-circuit behavior of their synchronous
// counterparts when a permission or database lookup becomes asynchronous.
export async function filterAsync<T>(
  items: T[],
  predicate: (item: T, index: number) => Promise<unknown>,
) {
  const result: T[] = [];
  for (let i = 0; i < items.length; i++)
    if (await predicate(items[i], i)) result.push(items[i]);
  return result;
}
export async function findAsync<T>(
  items: T[],
  predicate: (item: T, index: number) => Promise<unknown>,
) {
  for (let i = 0; i < items.length; i++)
    if (await predicate(items[i], i)) return items[i];
}
export async function someAsync<T>(
  items: T[],
  predicate: (item: T, index: number) => Promise<unknown>,
) {
  return (await findAsync(items, predicate)) !== undefined;
}
export async function everyAsync<T>(
  items: T[],
  predicate: (item: T, index: number) => Promise<unknown>,
) {
  for (let i = 0; i < items.length; i++)
    if (!(await predicate(items[i], i))) return false;
  return true;
}
export async function flatMapAsync<T, U>(
  items: T[],
  map: (item: T, index: number) => Promise<U[]>,
) {
  const result:U[]=[];for(let i=0;i<items.length;i++)result.push(...await map(items[i],i));return result;
}

export async function mapAsync<T,U>(items:T[],map:(item:T,index:number)=>Promise<U>){const result:U[]=[];for(let i=0;i<items.length;i++)result.push(await map(items[i],i));return result;}
