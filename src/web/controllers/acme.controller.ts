import { Acme } from "../../acme.js";
import { Controller, controller, httpGet } from "../shared/controller.js";
import fs from 'fs';

@controller({ allowAnonymous: true })
export class AcmeController extends Controller {
    @httpGet("/.well-known/acme-challenge/:token")
    getChallengeToken() {
        return Acme.getChallenge(this.request.params.token);
    }
    // this.server.get("/.well-known/acme-challenge/:token", (request, response) => {
    //     response.send(this.challenge[request.params.token]);
    // });
}
