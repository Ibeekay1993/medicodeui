import { useMutation, useQueryClient } from "@tanstack/react-query";
import { HospitalService } from "../services/hospitalService";

export function useSubmitHospitalRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: any) => {
      const { email, familyPolicy, requestData, isReferral } = payload;
      
      if (email && email !== "no-email@ronsbergerhmo.io" && !email.startsWith("no-email@") && !email.endsWith("@medicode.com")) {
        const emailCheck = await HospitalService.validatePolicyEmail(email, familyPolicy);
        if (emailCheck && !emailCheck.allowed) {
          throw new Error(emailCheck.reason || "This email address is already associated with another policy family.");
        }
        await HospitalService.registerPolicyEmail(email, familyPolicy);
      }

      if (requestData.referralHospitalName && !requestData.referralHospitalId) {
        const foundId = await HospitalService.findHospitalIdByName(requestData.referralHospitalName);
        if (foundId) {
          requestData.referralHospitalId = foundId;
          requestData.claimingHospitalId = foundId;
        }
      }

      const insertedRequest = await HospitalService.createAuthorizationRequest(requestData.dbPayload);

      if (isReferral) {
         await HospitalService.sendOtp(insertedRequest.id, email || "no-email@ronsbergerhmo.io");
      }

      return insertedRequest;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hospital-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["hospital-authorizations"] });
    },
  });
}
