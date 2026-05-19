import { useNavigate } from "react-router-dom";
import { useSignupMutation } from "../app/auth/authApi";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { signupSchema } from "./validation/authSchema";
import type { SignupFormData } from "./validation/authSchema";

function Signup() {
  const navigate = useNavigate();
  const [signup, { isLoading }] = useSignupMutation();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
  });

  const onSubmit = async (data: SignupFormData) => {
    try {
      const res = await signup(data).unwrap();
      console.log(res)

      toast.success("Signup successful");
      navigate("/");
    } catch (err: any) {
      const message = err?.data?.detail;

      if (message === "Email already exists") {
        toast.error("Already registered. Redirecting to login...");

        setTimeout(() => {
          navigate("/"); 
        }, 1000);

        return;
      }

      toast.error("Signup failed");
    }
  };

  return (
    <div className="h-screen flex justify-center items-center">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="w-[400px] shadow-lg p-5 rounded-lg"
      >
        <h1 className="text-3xl font-bold mb-5">Signup</h1>

        <input
          type="text"
          placeholder="Name"
          className="border w-full p-3 mb-1"
          {...register("name")}
        />
        {errors.name && (
          <p className="text-red-500 text-sm mb-2">{errors.name.message}</p>
        )}

        <input
          type="email"
          placeholder="Email"
          className="border w-full p-3 mb-1"
          {...register("email")}
        />
        {errors.email && (
          <p className="text-red-500 text-sm mb-2">{errors.email.message}</p>
        )}

        <input
          type="password"
          placeholder="Password"
          className="border w-full p-3 mb-1"
          {...register("password")}
        />
        {errors.password && (
          <p className="text-red-500 text-sm mb-2">
            {errors.password.message}
          </p>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className="bg-black text-white w-full p-3 rounded mt-2"
        >
          {isLoading ? "Signing up..." : "Signup"}
        </button>

        <p className="text-sm text-center mt-3">
          Already registered?{" "}
          <span
            className="text-blue-500 cursor-pointer"
            onClick={() => navigate("/")} 
          >
            Login
          </span>
        </p>
      </form>
    </div>
  );
}

export default Signup;