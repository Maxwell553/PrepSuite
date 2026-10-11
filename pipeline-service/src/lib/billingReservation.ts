import {backend} from './backend.js';
/** Existing UI conversion is five analyzed games per credit. Charging is opt-in. */
export const analysisCost=(games:number)=>Math.ceil(Math.max(0,games)/5);
export async function reserveCredits(requestId:string,userId:string,games:number){
 const {data,error}=await backend().rpc('reserve_analysis_credits',{p_request_id:requestId,p_user_id:userId,p_amount:analysisCost(games)});
 if(error)throw new Error('Credit reservation is temporarily unavailable');
 if(data!==true)throw new Error('Not enough credits for this analysis');
}
export async function settleCredits(requestId:string,games:number,success:boolean){
 const {data,error}=await backend().rpc('settle_analysis_credits',{p_request_id:requestId,p_amount:analysisCost(games),p_success:success});
 if(error)throw new Error('Credit settlement is temporarily unavailable');return Number(data)||0;
}
