import { Acme } from "../../acme.js";
import { Controller, controller, httpGet } from "../shared/controller.js";
import fs from 'fs';

@controller({ allowAnonymous: true })
export class AcmeController extends Controller {
    @httpGet("/.well-known/acme-challenge/:token")
    getChallengeToken() {
        const token = Acme.getChallenge(this.request.params.token);
        if (token){
            return token;
        }
        return "";
    }

    // @httpGet("/test")
    // test(){
    //     return "TesT";
    // }
    // this.server.get("/.well-known/acme-challenge/:token", (request, response) => {
    //     response.send(this.challenge[request.params.token]);
    // });
}
